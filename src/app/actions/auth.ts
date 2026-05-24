"use server";

import { redirect } from "next/navigation";
import {
  createSession,
  destroySession,
  hasUsers,
  requireUser,
} from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  changePasswordSchema,
  passwordSchema,
  usernameSchema,
} from "@/lib/validation";

export async function loginAction(formData: FormData) {
  const username = usernameSchema.safeParse(formData.get("username"));
  const password = passwordSchema.safeParse(formData.get("password"));

  if (!username.success || !password.success) {
    redirect("/login?error=invalid");
  }

  const user = await prisma.user.findUnique({
    where: { username: username.data },
  });

  if (!user || !(await verifyPassword(password.data, user.passwordHash))) {
    redirect("/login?error=invalid");
  }

  await createSession(user.id);
  redirect("/workouts");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function setupAdminAction(formData: FormData) {
  if (await hasUsers()) {
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
  redirect("/workouts");
}

export async function changePasswordAction(formData: FormData) {
  const currentUser = await requireUser();
  const input = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!input.success) {
    redirect("/account/password?error=invalid");
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
  });

  if (
    !user ||
    !(await verifyPassword(input.data.currentPassword, user.passwordHash))
  ) {
    redirect("/account/password?error=current");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(input.data.newPassword),
    },
  });
  await prisma.session.deleteMany({
    where: { userId: user.id },
  });
  await createSession(user.id);

  redirect("/account/password?changed=1");
}
