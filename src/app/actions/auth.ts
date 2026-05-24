"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, hasUsers } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { passwordSchema, usernameSchema } from "@/lib/validation";

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
