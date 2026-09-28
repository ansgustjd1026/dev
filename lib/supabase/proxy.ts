import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isInvalidRefreshToken(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";

  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    message.includes("refresh token is not valid")
  );
}

function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse
) {
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith("sb-") || !cookie.name.includes("-auth-token")) {
      continue;
    }

    request.cookies.delete(cookie.name);
    response.cookies.set(cookie.name, "", {
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    });
  }
}

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: claimsData, error } = await supabase.auth.getClaims();

  if (isInvalidRefreshToken(error)) {
    clearSupabaseAuthCookies(request, response);
  }

  const userId = claimsData?.claims?.sub;
  const pathname = request.nextUrl.pathname;
  const bypassSuspensionCheck =
    pathname === "/suspended" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/admin/");

  if (userId && !bypassSuspensionCheck) {
    const { data: plan } = await supabase
      .from("user_plans")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle<{ status: string | null }>();

    if (plan?.status === "suspended") {
      if (pathname.startsWith("/api/")) {
        return copyCookies(
          response,
          NextResponse.json(
            { error: "계정이 정지되어 이 기능을 사용할 수 없습니다.", code: "ACCOUNT_SUSPENDED" },
            { status: 403 }
          )
        );
      }

      const suspendedUrl = request.nextUrl.clone();
      suspendedUrl.pathname = "/suspended";
      suspendedUrl.search = "";
      return copyCookies(response, NextResponse.redirect(suspendedUrl));
    }
  }

  return response;
}
