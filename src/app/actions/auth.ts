"use server";

import { redirect } from "next/navigation";
import {
  createSession,
  destroySession,
  hasUsers,
  requireUser,
} from "@/lib/auth";
import { loggedAction } from "@/lib/logged-action";
import { getLogger } from "@/lib/logger";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  changePasswordSchema,
  passwordSchema,
  usernameSchema,
} from "@/lib/validation";

export async function loginAction(formData: FormData) {
  return loggedAction("loginAction", async () => {
    const username = usernameSchema.safeParse(formData.get("username"));
    const password = passwordSchema.safeParse(formData.get("password"));

    if (!username.success || !password.success) {
      getLogger().warn(
        { event: "auth.login_failed", reason: "invalid_input" },
        "Login rejected",
      );
      redirect("/login?error=invalid");
    }

    const user = await prisma.user.findUnique({
      where: { username: username.data },
    });

    if (!user || !(await verifyPassword(password.data, user.passwordHash))) {
      getLogger().warn(
        { event: "auth.login_failed", reason: "invalid_credentials" },
        "Login rejected",
      );
      redirect("/login?error=invalid");
    }

    await createSession(user.id);
    getLogger().info(
      {
        event: "auth.login_succeeded",
        userId: user.id,
        destination: "/workouts",
      },
      "Login succeeded",
    );
    redirect("/workouts");
  });
}

export async function logoutAction() {
  return loggedAction("logoutAction", async () => {
    await destroySession();
    redirect("/login");
  });
}

export async function setupAdminAction(formData: FormData) {
  return loggedAction("setupAdminAction", async () => {
    if (await hasUsers()) {
      getLogger().warn(
        { event: "auth.setup_denied", reason: "already_initialized" },
        "Account setup denied",
      );
      redirect("/login");
    }

    const username = usernameSchema.parse(formData.get("username"));
    const password = passwordSchema.parse(formData.get("password"));

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        role: "ADMIN",
      },
    });

    await createSession(user.id);
    getLogger().info(
      { event: "auth.setup_completed", userId: user.id },
      "Admin account created",
    );
    redirect("/workouts");
  });
}

export async function changePasswordAction(formData: FormData) {
  return loggedAction("changePasswordAction", async () => {
    const currentUser = await requireUser();
    const input = changePasswordSchema.safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });

    if (!input.success) {
      getLogger().warn(
        {
          event: "auth.password_change_failed",
          userId: currentUser.id,
          reason: "invalid_input",
        },
        "Password change rejected",
      );
      redirect("/account/password?error=invalid");
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
    });

    if (
      !user ||
      !(await verifyPassword(input.data.currentPassword, user.passwordHash))
    ) {
      getLogger().warn(
        {
          event: "auth.password_change_failed",
          userId: currentUser.id,
          reason: "invalid_credentials",
        },
        "Password change rejected",
      );
      redirect("/account/password?error=current");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(input.data.newPassword),
      },
    });
    const revoked = await prisma.session.deleteMany({
      where: { userId: user.id },
    });
    getLogger().info(
      {
        event: "session.revoked",
        userId: user.id,
        deletedSessions: revoked.count,
        reason: "password_changed",
      },
      "User sessions revoked",
    );
    await createSession(user.id);
    getLogger().info(
      { event: "auth.password_changed", userId: user.id },
      "Password changed and session replaced",
    );

    redirect("/account/password?changed=1");
  });
}
