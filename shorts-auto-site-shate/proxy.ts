import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const TOSS_ORIGIN = /^https:\/\/[a-z0-9-]+\.apps\.tossmini\.com$/i;
const LOCAL_APP_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function getAllowedApiOrigin(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  return TOSS_ORIGIN.test(origin) || LOCAL_APP_ORIGIN.test(origin) ? origin : "";
}

export async function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const allowedOrigin = isApi ? getAllowedApiOrigin(request) : "";
  if (isApi && request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }

  const response = await updateSession(request);
  if (allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
