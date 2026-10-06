import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

// production-এ __Host- prefix: ব্রাউজার জোর করে Secure + Path=/ + কোনো Domain নয় ধরে নেয়
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-session" : "session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type Session = { email: string };

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set (min 32 chars)");
  return new TextEncoder().encode(secret);
}

// proxy (যেখানে next/headers-এর cookies() নেই) আর API রুট, দুটোই এটা ব্যবহার করবে
export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const key = secretKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!payload.sub || !adminEmail || payload.sub !== adminEmail) return null;
    return { email: payload.sub };
  } catch {
    return null; // মেয়াদ শেষ, সই ভুল, বা token নষ্ট
  }
}

export async function createSession(email: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email.trim().toLowerCase())
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(secretKey());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS });
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}