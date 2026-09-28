import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { getCreditUsageSummary } from "@/lib/credits/usage";

export async function GET() {
  try {
    const user = await getAuthenticatedApiUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const summary = await getCreditUsageSummary({
      userId: user.id,
    });

    return NextResponse.json({ summary });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Credit 정보를 불러오지 못했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
