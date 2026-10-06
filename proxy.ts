import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

const HOME = "/pods"; // লগইন পেজের DEFAULT_REDIRECT-এর সাথে মিলিয়ে রাখুন

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // লগইন API আর মেশিন API (এটার নিজস্ব API key গেট আছে) সেশন ছাড়াই খোলা
  if (pathname === "/api/auth/login" || pathname.startsWith("/api/v1/")) {
    return NextResponse.next();
  }

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL(HOME, req.url)) : NextResponse.next();
  }

  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL("/login", req.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};