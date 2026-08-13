import argon2 from "argon2";

// Argon2id is the recommended variant: resistant to both GPU cracking
// (like Argon2d) and side-channel attacks (like Argon2i).
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB, OWASP minimum recommendation
  timeCost: 2,
  parallelism: 1,
} satisfies argon2.Options;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed/unknown hash format (e.g. a legacy bcrypt hash) — never throw
    // out of an auth check, just treat it as an invalid credential.
    return false;
  }
}
