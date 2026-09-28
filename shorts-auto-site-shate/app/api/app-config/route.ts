import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.apps\.tossmini\.com$/i;
const LOCAL_ORIGIN_PATTERN =
  /^http:\/\/(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(:\d+)?$/;

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin =
    LOCAL_ORIGIN_PATTERN.test(origin) || ALLOWED_ORIGIN_PATTERN.test(origin)
      ? origin
      : "";

  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "앱 인증 설정이 비어 있습니다." },
      { status: 503, headers: getCorsHeaders(request) },
    );
  }

  return NextResponse.json(
    { supabaseUrl, supabaseAnonKey },
    { headers: getCorsHeaders(request) },
  );
}
