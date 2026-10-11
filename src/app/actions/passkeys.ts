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
  await prisma.passkeyChallenge.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: new Date() } },
        ...(previous ? [{ tokenHash: hashToken(previous) }] : []),
      ],
    },
  });
  const token = randomBytes(32).toString("base64url");
  await prisma.passkeyChallenge.create({
    data: {
      tokenHash: hashToken(token),
      challenge,
      purpose,
      userId,
      expiresAt: new Date(Date.now() + 300_000),
    },
  });
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
}

export async function registerPasskey(
  response: RegistrationResponseJSON,
  name: string,
) {
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
    if (!result.verified) return false;
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
    return true;
  } catch {
    return false;
  }
}

export async function passkeyAuthenticationOptions() {
  const { rpID } = await relyingParty();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });
  await saveChallenge(options.challenge, "authenticate");
  return options;
}

export async function authenticatePasskey(
  response: AuthenticationResponseJSON,
) {
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
      return false;
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
    if (!result.verified) return false;
    const updated = await prisma.passkey.updateMany({
      where: { id, counter: passkey.counter },
      data: {
        counter: BigInt(result.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    if (updated.count !== 1) return false;
    await createSession(passkey.userId);
    return true;
  } catch {
    return false;
  }
}

export async function deletePasskey(formData: FormData) {
  const user = await currentUser();
  const id = z.string().min(1).max(2048).parse(formData.get("id"));
  await prisma.passkey.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/account/passkeys");
}
