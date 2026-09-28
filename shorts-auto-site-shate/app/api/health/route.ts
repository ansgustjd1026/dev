import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getSupabaseConfigurationStatus } from "@/lib/supabase/config";
import { getFfmpegPath } from "@/lib/media/ffmpeg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

async function commandAvailable(command: string, args: string[]) {
  try {
    await execFileAsync(command, args, {
      timeout: 3_000,
      windowsHide: true,
      maxBuffer: 16 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const configuration = getSupabaseConfigurationStatus();
  const configured = configuration.supabaseUrl && configuration.supabaseAnonKey;
  const [ffmpeg, koreanCaptionFont] = await Promise.all([
    commandAvailable(getFfmpegPath(), ["-version"]),
    commandAvailable("fc-match", ["Noto Sans CJK KR"]),
  ]);

  return NextResponse.json(
    {
      ok: configured,
      service: "shate",
      configuration,
      renderer: {
        ffmpeg,
        koreanCaptionFont,
      },
    },
    { status: configured ? 200 : 503 }
  );
}
