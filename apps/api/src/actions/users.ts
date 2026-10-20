import { requireAdmin } from "../lib/auth.js";
import { loggedAction } from "../lib/logged-action.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { passwordSchema, usernameSchema } from "../lib/validation.js";

export async function createUserAction(formData: FormData) {
  return loggedAction("createUserAction", async () => {
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
  });
}
