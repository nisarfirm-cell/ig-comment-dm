import { hmacSha256Hex, timingSafeEqual } from "./signature";

export const SESSION_COOKIE = "igdm_session";
const SESSION_DAYS = 14;

/** Session cookie value: "<expiresAtMs>.<hmac>". Changing ADMIN_PASSWORD logs everyone out. */
export async function createSession(adminPassword: string, now = Date.now()): Promise<{ value: string; maxAge: number }> {
  const exp = now + SESSION_DAYS * 86_400_000;
  const sig = await hmacSha256Hex(adminPassword, `session:${exp}`);
  return { value: `${exp}.${sig}`, maxAge: SESSION_DAYS * 86_400 };
}

export async function verifySession(value: string | null | undefined, adminPassword: string, now = Date.now()): Promise<boolean> {
  if (!value || !adminPassword) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp <= now || !sig) return false;
  return timingSafeEqual(await hmacSha256Hex(adminPassword, `session:${exp}`), sig);
}

/** Compares via HMAC so the comparison time does not depend on the password length or content. */
export async function passwordMatches(given: string, adminPassword: string): Promise<boolean> {
  if (!adminPassword || typeof given !== "string") return false;
  const key = "igdm-login";
  return timingSafeEqual(await hmacSha256Hex(key, given), await hmacSha256Hex(key, adminPassword));
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  return [`${SESSION_COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`, secure ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");
}
