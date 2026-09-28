import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_BUCKETS = new Set([
  "background-videos",
  "tts-audio",
  "final-videos",
  "source-videos",
]);

type StorageBucketName =
  | "background-videos"
  | "tts-audio"
  | "final-videos"
  | "source-videos";

function getSafeBucket(value: unknown): StorageBucketName | null {
  if (typeof value !== "string") return null;
  if (!ALLOWED_BUCKETS.has(value)) return null;

  return value as StorageBucketName;
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedApiUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => null)) as {
      bucket?: unknown;
    } | null;
    const bucket = getSafeBucket(body?.bucket);

    if (!bucket) {
      return NextResponse.json(
        { error: "허용되지 않은 스토리지 버킷입니다." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error: getError } = await admin.storage.getBucket(bucket);

    if (!getError) {
      return NextResponse.json({ ok: true, bucket, created: false });
    }

    const { error: createError } = await admin.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: bucket === "source-videos" ? 104857600 : 52428800,
    });

    if (createError) {
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, bucket, created: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "스토리지 버킷 확인 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
