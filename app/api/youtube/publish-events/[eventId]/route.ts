import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { createAdminClient } from "@/lib/supabase/admin";

type Context = {
  params: Promise<{ eventId: string }>;
};

export async function DELETE(_request: Request, { params }: Context) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await params;

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }

  try {
    const { error } = await createAdminClient()
      .from("youtube_publish_events")
      .delete()
      .eq("id", eventId)
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not delete the YouTube publish record.",
      },
      { status: 500 }
    );
  }
}
