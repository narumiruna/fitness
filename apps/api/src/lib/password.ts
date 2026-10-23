import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;
const FORMAT = "bcrypt-sha256:v1:";

// Base64 keeps the full-input digest below bcrypt's 72-byte limit.
function passwordDigest(password: string) {
  return createHash("sha256")
    .update("fitness-password-v1\0")
    .update(password, "utf8")
    .digest("base64");
}

export async function hashPassword(password: string) {
  return `${FORMAT}${await bcrypt.hash(passwordDigest(password), SALT_ROUNDS)}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  if (passwordHash.startsWith(FORMAT))
    return bcrypt.compare(
      passwordDigest(password),
      passwordHash.slice(FORMAT.length),
    );
  // Existing accounts retain their original bcrypt verification until changed.
  return bcrypt.compare(password, passwordHash);
}
