import { sessionSchema, type Session, type TeacherRole } from "@kap-exam/shared";
import { SignJWT, jwtVerify } from "jose";

/**
 * Teacher auth primitives for the Worker.
 * - Passwords: PBKDF2-SHA256 via Web Crypto (no native deps in Workers).
 * - Sessions: stateless HS256 JWT; `teacher_sessions` adds revocation if needed.
 */

const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltRaw, hashRaw] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterationsRaw || !saltRaw || !hashRaw) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromB64url(saltRaw),
      iterations: Number(iterationsRaw),
      hash: "SHA-256",
    },
    key,
    256,
  );

  // Constant-time compare.
  const expected = fromB64url(hashRaw);
  const actual = new Uint8Array(bits);
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected[i]! ^ actual[i]!;
  return diff === 0;
}

export async function issueSession(
  teacher: { id: string; name: string; email: string; role: TeacherRole },
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ name: teacher.name, email: teacher.email, role: teacher.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(teacher.id)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(secretKey(secret));
}

export async function readSession(token: string, secret: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    const parsed = sessionSchema.safeParse({
      teacherId: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      expiresAt: new Date((payload.exp ?? 0) * 1000),
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "kap_exam_session";
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
