"use client";

import { useState } from "react";
import Button from "@/app/components/ui/Button";
import Surface from "@/app/components/ui/Surface";
import { cn } from "@/lib/ui/cn";

export type YouTubePublishEvent = {
  id: string;
  youtube_video_id: string | null;
  video_url: string;
  title: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

type Props = {
  events: YouTubePublishEvent[];
  loadFailed: boolean;
  locale: string;
  readOnly?: boolean;
};

function getText(locale: string) {
  if (locale === "ko") {
    return {
      title: "게시 이력",
      description: "최근 YouTube 업로드 기록입니다.",
      empty: "아직 게시 이력이 없습니다.",
      loadFailed: "게시 이력을 불러오지 못했습니다.",
      preview: "쇼츠 미리보기",
      openVideo: "YouTube 열기",
      delete: "기록 삭제",
      deleting: "삭제 중",
      deleteConfirm: "이 기록을 삭제할까요? YouTube 영상 자체는 삭제되지 않습니다.",
      deleteFailed: "기록을 삭제하지 못했습니다.",
      videoId: "Video ID",
      error: "오류",
      status: {
        queued: "대기 중",
        uploading: "업로드 중",
        published: "게시 완료",
        error: "실패",
      } as Record<string, string>,
    };
  }

  return {
    title: "Publish history",
    description: "Recent YouTube upload records.",
    empty: "No publish history yet.",
    loadFailed: "Could not load publish history.",
    preview: "Shorts preview",
    openVideo: "Open YouTube",
    delete: "Delete record",
    deleting: "Deleting",
    deleteConfirm: "Delete this record? The video on YouTube will not be deleted.",
    deleteFailed: "Could not delete this record.",
    videoId: "Video ID",
    error: "Error",
    status: {
      queued: "Queued",
      uploading: "Uploading",
      published: "Published",
      error: "Failed",
    } as Record<string, string>,
  };
}

function formatEventDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusClassName(status: string) {
  if (status === "published") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function getDisplayTitle(event: YouTubePublishEvent) {
  if (event.title?.trim()) return event.title.trim();

  try {
    const url = new URL(event.video_url);
    return decodeURIComponent(url.pathname.split("/").pop() || event.video_url);
  } catch {
    return event.video_url;
  }
}

export default function YouTubePublishHistory({
  events,
  loadFailed,
  locale,
  readOnly = false,
}: Props) {
  const text = getText(locale);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const items = events.filter((event) => !deletedIds.includes(event.id));

  async function deleteRecord(eventId: string) {
    if (!window.confirm(text.deleteConfirm)) return;

    setDeletingId(eventId);
    setDeleteError("");

    try {
      const response = await fetch(`/api/youtube/publish-events/${eventId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : text.deleteFailed
        );
      }

      setDeletedIds((current) => [...current, eventId]);
    } catch (error: unknown) {
      setDeleteError(error instanceof Error ? error.message : text.deleteFailed);
    } finally {
      setDeletingId("");
    }
  }

  return (
    <Surface className="p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">
          {text.title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{text.description}</p>
      </div>

      {loadFailed ? (
        <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {text.loadFailed}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          {text.empty}
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {items.map((event) => (
            <article
              key={event.id}
              className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[112px_minmax(0,1fr)]"
            >
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500 sm:hidden">
                  {text.preview}
                </p>
                <video
                  src={event.video_url}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  className="aspect-[9/16] w-full rounded-lg bg-slate-950 object-cover"
                />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-semibold",
                      getStatusClassName(event.status)
                    )}
                  >
                    {text.status[event.status] || event.status}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatEventDate(event.created_at, locale)}
                  </span>
                </div>

                <p className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900">
                  {getDisplayTitle(event)}
                </p>

                {event.error_message ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {text.error}: {event.error_message}
                  </p>
                ) : null}

                {event.youtube_video_id ? (
                  <p className="mt-3 text-xs text-slate-500">
                    {text.videoId}: {event.youtube_video_id}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={
                      event.youtube_video_id
                        ? `https://www.youtube.com/watch?v=${event.youtube_video_id}`
                        : event.video_url
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    {text.openVideo}
                  </a>
                  {!readOnly ? (
                    <Button
                      type="button"
                      variant="danger"
                      className="min-h-10 px-3 py-2"
                      onClick={() => deleteRecord(event.id)}
                      disabled={deletingId === event.id}
                    >
                      {deletingId === event.id ? text.deleting : text.delete}
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {deleteError ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </p>
      ) : null}
    </Surface>
  );
}
