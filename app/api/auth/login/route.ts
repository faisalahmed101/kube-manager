import { verifyAdminLogin } from "@/lib/auth/password";
import { checkLoginAllowed, clearLoginFailures, recordLoginFailure } from "@/lib/auth/rateLimit";
import { createSession } from "@/lib/auth/session";

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// অন্য সাইট থেকে আসা POST আটকায় (SameSite-এর সাথে দ্বিতীয় স্তর)
function originOk(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!originOk(req)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const ip = clientIp(req);
  const gate = checkLoginAllowed(ip);
  if (!gate.allowed) {
    return Response.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const ok = await verifyAdminLogin(email, password);
  if (!ok) {
    recordLoginFailure(ip);
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  clearLoginFailures(ip);
  await createSession(email);
  return Response.json({ ok: true });
}