import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-user";
import {
  enforceRateLimit,
  getRequestLimitResponse,
  isStringWithinLimit,
  readJsonBody,
} from "@/lib/security/api-limits";
import { downloadStorageFile } from "@/lib/security/storage-download";
import {
  getFfmpegMissingMessage,
  getFfmpegPath,
  isFfmpegMissingError,
} from "@/lib/media/ffmpeg";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, rm } from "fs/promises";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

async function getDuration(filePath: string) {
  try {
    await execFileAsync(getFfmpegPath(), ["-i", filePath], {
      maxBuffer: 1024 * 1024 * 20,
    });
  } catch (error: unknown) {
    if (isFfmpegMissingError(error)) {
      throw new Error(getFfmpegMissingMessage());
    }

    const err = error as { stderr?: string; message?: string };
    const stderr = err.stderr ?? "";

    const match = stderr.match(/Duration:\s(\d+):(\d+):(\d+\.\d+)/);

    if (!match) {
      throw new Error(`길이를 확인할 수 없습니다. ${err.message ?? ""}`);
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);

    return hours * 3600 + minutes * 60 + seconds;
  }

  throw new Error("길이를 확인할 수 없습니다.");
}

export async function POST(req: Request) {
  let tempDir = "";

  try {
    const user = await getAuthenticatedApiUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const rateLimitResponse = enforceRateLimit({
      key: `media-duration:${user.id}`,
      limit: 30,
      windowMs: 60_000,
    });

    if (rateLimitResponse) return rateLimitResponse;

    const body = (await readJsonBody(req, 8 * 1024)) as {
      url?: unknown;
      fileType?: unknown;
    };
    const { url, fileType } = body;

    if (!isStringWithinLimit(url, 2_048)) {
      return NextResponse.json(
        { error: "파일 URL이 없습니다." },
        { status: 400 }
      );
    }

    tempDir = path.join(os.tmpdir(), `media-duration-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const extension = fileType === "audio" ? "mp3" : "mp4";
    const filePath = path.join(tempDir, `media.${extension}`);

    const isAudio = fileType === "audio";

    await downloadStorageFile({
      url: url as string,
      outputPath: filePath,
      bucket: isAudio ? "tts-audio" : "background-videos",
      userId: user.id,
      maxBytes: isAudio ? 20 * 1024 * 1024 : 50 * 1024 * 1024,
    });

    const duration = await getDuration(filePath);

    return NextResponse.json({
      duration,
    });
  } catch (error: unknown) {
    const limitResponse = getRequestLimitResponse(error);
    if (limitResponse) return limitResponse;

    let message = "파일 길이 확인 중 오류가 발생했습니다.";

    if (error instanceof Error) {
      message = error.message;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
