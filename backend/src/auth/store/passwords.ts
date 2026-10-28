import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/* ---------------- passwords ---------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nn, r, p, saltB64, keyB64] = parts as [string, string, string, string, string, string];
  const want = Buffer.from(keyB64, "base64");
  const got = scryptSync(password, Buffer.from(saltB64, "base64"), want.length, { N: Number(nn), r: Number(r), p: Number(p) });
  return got.length === want.length && timingSafeEqual(got, want);
}

const DUMMY_HASH = hashPassword(randomBytes(12).toString("hex"));
/** Same work as a real check, so a missing account is not faster than a wrong password. */
export function burnPasswordCheck(password: string) {
  verifyPassword(password, DUMMY_HASH);
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "Password is too long.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letters and at least one number.";
  return null;
}

export function normalEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
