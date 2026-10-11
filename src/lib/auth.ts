import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestLogger } from "@/lib/request-logger";

const SESSION_COOKIE = "fitness_session";
const SESSION_DAYS = 30;

export type CurrentUser = {
  id: string;
  username: string;
  role: string;
};

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const log = await getRequestLogger();
  const secure = process.env.NODE_ENV === "production";
  const session = await withLogger(log, () =>
    prisma.session.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
      },
    }),
  );
  log.info(
    { event: "session.created", userId, sessionId: session.id, expiresAt },
    "Session created",
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt,
    path: "/",
  });
  log.info(
    {
      event: "session.cookie_set",
      userId,
      sessionId: session.id,
      secure,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expiresAt,
    },
    "Session cookie set",
  );
  const bindings = log.bindings();
  if (
    secure &&
    (bindings.protocol === "http" || bindings.originProtocol === "http")
  ) {
    log.warn(
      { event: "session.secure_cookie_over_http", userId, secure },
      "Secure session cookie may be rejected over HTTP; use HTTPS except on browser-supported loopback hosts",
    );
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  const log = await getRequestLogger();
  let deletedSessions = 0;
  if (token) {
    const result = await withLogger(log, () =>
      prisma.session.deleteMany({
        where: { tokenHash: hashToken(token) },
      }),
    );
    deletedSessions = result.count;
  }

  cookieStore.delete(SESSION_COOKIE);
  log.info(
    {
      event: "session.destroyed",
      hadSessionCookie: Boolean(token),
      deletedSessions,
    },
    "Session destroyed and cookie cleared",
  );
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  const log = await getRequestLogger();
  if (!token) {
    log.info(
      { event: "session.missing_cookie" },
      "Request has no session cookie",
    );
    return null;
  }

  const session = await withLogger(log, () =>
    prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
      },
    }),
  );

  if (!session) {
    log.warn(
      { event: "session.not_found" },
      "Session cookie does not match a stored session",
    );
    return null;
  }
  if (session.expiresAt <= new Date()) {
    log.warn(
      {
        event: "session.expired",
        sessionId: session.id,
        userId: session.user.id,
        expiresAt: session.expiresAt,
      },
      "Session expired",
    );
    await withLogger(log, () =>
      prisma.session.deleteMany({ where: { id: session.id } }),
    );
    return null;
  }

  log.info(
    {
      event: "session.authenticated",
      sessionId: session.id,
      userId: session.user.id,
      expiresAt: session.expiresAt,
    },
    "Session authenticated",
  );
  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    (await getRequestLogger()).warn(
      { event: "auth.required", destination: "/login" },
      "Unauthenticated request redirected to login",
    );
    redirect("/login");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    (await getRequestLogger()).warn(
      { event: "auth.admin_denied", userId: user.id, destination: "/workouts" },
      "Admin access denied",
    );
    redirect("/workouts");
  }

  return user;
}

export async function hasUsers() {
  const log = await getRequestLogger();
  const count = await withLogger(log, () => prisma.user.count());
  log.info(
    { event: "auth.setup_status", hasUsers: count > 0 },
    "Account setup status checked",
  );
  return count > 0;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
