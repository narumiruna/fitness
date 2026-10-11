"use server";

import { createHash, randomBytes } from "node:crypto";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createSession, getCurrentUser } from "@/lib/auth";
import { loggedAction } from "@/lib/logged-action";
import { getLogger } from "@/lib/logger";
import { storePasskeyChallenge } from "@/lib/passkey-challenges";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { passkeyNameSchema, passwordSchema } from "@/lib/validation";

const challengeCookie = "fitness_passkey_challenge";

async function relyingParty() {
  const origin = (await headers()).get("origin");
  if (!origin) throw new Error("Missing origin.");
  const url = new URL(origin);
  if (process.env.NODE_ENV === "production") {
    if (url.protocol !== "https:" || origin !== process.env.PASSKEY_ORIGIN) {
      throw new Error("Invalid passkey origin.");
    }
  } else if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.protocol !== "http:"
  ) {
    throw new Error("Invalid development origin.");
  }
  return { origin, rpID: url.hostname };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function saveChallenge(
  challenge: string,
  purpose: string,
  userId?: string,
) {
  const store = await cookies();
  const previous = store.get(challengeCookie)?.value;
  const token = randomBytes(32).toString("base64url");
  await storePasskeyChallenge(
    {
      tokenHash: hashToken(token),
      challenge,
      purpose,
      userId,
      expiresAt: new Date(Date.now() + 300_000),
    },
    previous ? hashToken(previous) : undefined,
  );
  store.set(challengeCookie, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 300,
  });
}

async function consumeChallenge(purpose: string, userId?: string) {
  const store = await cookies();
  const token = store.get(challengeCookie)?.value;
  store.delete(challengeCookie);
  if (!token) throw new Error("Missing challenge.");
  const tokenHash = hashToken(token);
  const challenge = await prisma.passkeyChallenge.findUnique({
    where: { tokenHash },
  });
  const deleted = await prisma.passkeyChallenge.deleteMany({
    where: { tokenHash },
  });
  if (
    !challenge ||
    deleted.count !== 1 ||
    challenge.purpose !== purpose ||
    challenge.userId !== (userId ?? null) ||
    challenge.expiresAt <= new Date()
  ) {
    throw new Error("Invalid challenge.");
  }
  return challenge.challenge;
}

async function currentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required.");
  return user;
}

export async function passkeyRegistrationOptions(password: string) {
  return loggedAction("passkeyRegistrationOptions", async () => {
    const user = await currentUser();
    const account = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    if (
      !(await verifyPassword(
        passwordSchema.parse(password),
        account.passwordHash,
      ))
    ) {
      getLogger().warn(
        {
          event: "auth.passkey_registration_failed",
          userId: user.id,
          reason: "invalid_credentials",
        },
        "Passkey registration denied",
      );
      throw new Error("Invalid password.");
    }
    const { rpID } = await relyingParty();
    const passkeys = await prisma.passkey.findMany({
      where: { userId: user.id },
    });
    const options = await generateRegistrationOptions({
      rpName: "Fitness",
      rpID,
      userName: user.username,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: passkeys.map(({ id }) => ({ id })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    await saveChallenge(options.challenge, "register", user.id);
    return options;
  });
}

export async function registerPasskey(
  response: RegistrationResponseJSON,
  name: string,
) {
  return loggedAction("registerPasskey", async () => {
    try {
      const user = await currentUser();
      const { origin, rpID } = await relyingParty();
      const challenge = await consumeChallenge("register", user.id);
      const result = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!result.verified)
        throw new Error("Passkey registration not verified.");
      const { credential } = result.registrationInfo;
      await prisma.passkey.create({
        data: {
          id: credential.id,
          userId: user.id,
          name: passkeyNameSchema.parse(name),
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
        },
      });
      revalidatePath("/account/passkeys");
      getLogger().info(
        { event: "auth.passkey_registered", userId: user.id },
        "Passkey registered",
      );
      return true;
    } catch (err) {
      getLogger().warn(
        { event: "auth.passkey_registration_failed", err },
        "Passkey registration failed",
      );
      return false;
    }
  });
}

export async function passkeyAuthenticationOptions() {
  return loggedAction("passkeyAuthenticationOptions", async () => {
    const { rpID } = await relyingParty();
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
    });
    await saveChallenge(options.challenge, "authenticate");
    return options;
  });
}

export async function authenticatePasskey(
  response: AuthenticationResponseJSON,
) {
  return loggedAction("authenticatePasskey", async () => {
    try {
      const { origin, rpID } = await relyingParty();
      const challenge = await consumeChallenge("authenticate");
      const id = z.string().min(1).max(2048).parse(response.id);
      const passkey = await prisma.passkey.findUnique({ where: { id } });
      if (
        !passkey ||
        response.response.userHandle !==
          Buffer.from(passkey.userId).toString("base64url")
      ) {
        throw new Error("Invalid passkey credential.");
      }
      const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
        },
      });
      if (!result.verified)
        throw new Error("Passkey authentication not verified.");
      const updated = await prisma.passkey.updateMany({
        where: { id, counter: passkey.counter },
        data: {
          counter: BigInt(result.authenticationInfo.newCounter),
          lastUsedAt: new Date(),
        },
      });
      if (updated.count !== 1)
        throw new Error("Passkey changed during sign-in.");
      await createSession(passkey.userId);
      getLogger().info(
        { event: "auth.passkey_login_succeeded", userId: passkey.userId },
        "Passkey sign-in succeeded",
      );
      return true;
    } catch (err) {
      getLogger().warn(
        { event: "auth.passkey_login_failed", err },
        "Passkey sign-in failed",
      );
      return false;
    }
  });
}

export async function deletePasskey(formData: FormData) {
  return loggedAction("deletePasskey", async () => {
    const user = await currentUser();
    const id = z.string().min(1).max(2048).parse(formData.get("id"));
    const deleted = await prisma.passkey.deleteMany({
      where: { id, userId: user.id },
    });
    getLogger().info(
      {
        event: "auth.passkey_deleted",
        userId: user.id,
        deletedPasskeys: deleted.count,
      },
      "Passkey removal completed",
    );
    revalidatePath("/account/passkeys");
  });
}
