"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { passwordSchema, usernameSchema } from "@/lib/validation";

export async function createUserAction(formData: FormData) {
  await requireAdmin();
  const username = usernameSchema.parse(formData.get("username"));
  const password = passwordSchema.parse(formData.get("password"));
  const role = formData.get("role") === "ADMIN" ? "ADMIN" : "USER";

  await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      role,
    },
  });

  revalidatePath("/admin/users");
}
