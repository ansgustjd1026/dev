export type ProjectStatus = "draft" | "script_ready" | "audio_ready" | "background_selected" | "final_ready" | "completed";

export type TimedCaption = {
  text: string;
  start: number;
  end: number;
};

export type Project = {
  id: string;
  title: string | null;
  topic: string | null;
  script: string | null;
  voice: string | null;
  audio_path: string | null;
  audio_url: string | null;
  audio_duration: number | null;
  timed_captions: TimedCaption[] | null;
  final_video_path: string | null;
  final_video_url: string | null;
  final_video_size: number | null;
  visual_style: string | null;
  status: ProjectStatus;
  updated_at: string;
};

export type Plan = "free" | "starter" | "pro";
export type AppTab = "projects" | "create" | "credits" | "settings";

export type CreditSummary = {
  monthlyLimit: number;
  usedCredits: number;
  remainingCredits: number;
  periodStart: string;
  periodEnd: string;
  actionCounts: Record<string, number>;
  actionCredits: Record<string, number>;
};

export type AppPreferences = {
  language: "ko" | "en" | "ja" | "zh" | "es" | "fr";
  durationSeconds: 30 | 45 | 60 | 90 | 120;
  voice: "random" | "alloy" | "nova" | "shimmer" | "echo" | "onyx" | "fable";
  visualStyle: "cinematic" | "anime-2d" | "monochrome-2d" | "anime-3d" | "animal-character" | "webtoon";
  youtubePrivacy: "public" | "unlisted" | "private";
  pinnedComment: string;
};

export type AutoStage = "idle" | "script" | "voice" | "captions" | "video" | "done" | "error";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  createdAt?: string;
  persistent?: boolean;
};
