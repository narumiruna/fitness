import { ApiError, redirect } from "../errors.js";
import {
  createSession,
  destroySession,
  hasUsers,
  requireUser,
} from "../lib/auth.js";
import { loggedAction } from "../lib/logged-action.js";
import { getLogger } from "../lib/logger.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import {
  changePasswordSchema,
  passwordSchema,
  usernameSchema,
} from "../lib/validation.js";

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

    await createSession(user.id, user.passwordHash);
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

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(
      async (tx) => {
        // There is no setup row to lock. PostgreSQL serializable predicate reads
        // prevent two empty-table setup transactions from both committing.
        if (await tx.user.count()) throw new ApiError(409, "CONFLICT");
        return tx.user.create({
          data: { username, passwordHash, role: "ADMIN" },
        });
      },
      { isolationLevel: "Serializable" },
    );

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

    const passwordHash = await hashPassword(input.data.newPassword);
    const revoked = await prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash },
      });
      if (changed.count !== 1) throw new ApiError(409, "CONFLICT");
      return tx.session.deleteMany({ where: { userId: user.id } });
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
    await createSession(user.id, passwordHash);
    getLogger().info(
      { event: "auth.password_changed", userId: user.id },
      "Password changed and session replaced",
    );

    redirect("/account/password?changed=1");
  });
}
