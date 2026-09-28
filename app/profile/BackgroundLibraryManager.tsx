"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SiteLocale } from "@/lib/i18n/config";
import { getSiteText } from "@/lib/i18n/translations";
import InlineStatus from "@/app/components/ui/InlineStatus";

type BackgroundVideo = {
  name: string;
  path: string;
  url: string;
  size?: number;
};

type Props = {
  locale: SiteLocale;
};

const DEFAULT_LIMITS = {
  backgroundVideoMaxFiles: 3,
  backgroundVideoMaxStorageMb: 150,
  backgroundVideoMaxFileSizeMb: 50,
};

type BackgroundVideoLimits = typeof DEFAULT_LIMITS;

function sanitizeFileName(fileName: string) {
  return fileName.trim().replace(/[\\/]/g, "-");
}

function encodeFileName(fileName: string) {
  const bytes = new TextEncoder().encode(fileName);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeFileName(fileName: string) {
  const base64 = fileName.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function toStorageFileName(fileName: string, extension: string) {
  return `u_${encodeFileName(fileName)}.${extension}`;
}

function toDisplayFileName(fileName: string) {
  if (fileName.startsWith("u_")) {
    const extensionSeparatorIndex = fileName.lastIndexOf(".");
    const encodedName =
      extensionSeparatorIndex > 2
        ? fileName.slice(2, extensionSeparatorIndex)
        : fileName.slice(2);

    try {
      return decodeFileName(encodedName);
    } catch {
      return fileName;
    }
  }

  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "-";

  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.max(0.1, mb).toFixed(1)}MB`;
  return `${mb.toFixed(1)}MB`;
}

export default function BackgroundLibraryManager({ locale }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const uploadInputId = useId();
  const labels = getSiteText(locale).create.backgroundPicker;
  const textFor = useCallback(
    (ko: string, en: string) => (locale === "ko" ? ko : en),
    [locale]
  );

  const [videos, setVideos] = useState<BackgroundVideo[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingPath, setIsDeletingPath] = useState("");
  const [deleteConfirmPath, setDeleteConfirmPath] = useState("");
  const [limits, setLimits] = useState<BackgroundVideoLimits>(DEFAULT_LIMITS);

  const selectedVideo = videos.find((video) => video.path === selectedPath) ?? videos[0];
  const usedStorageMb =
    videos.reduce((sum, video) => sum + (video.size ?? 0), 0) / 1024 / 1024;

  const loadPlanLimits = useCallback(async () => {
    const response = await fetch("/api/plan-limits", {
      cache: "no-store",
    });

    if (!response.ok) return;

    const data = await response.json();
    const nextLimits = data?.limits;

    if (!nextLimits || typeof nextLimits !== "object") return;

    setLimits({
      backgroundVideoMaxFiles:
        typeof nextLimits.backgroundVideoMaxFiles === "number"
          ? nextLimits.backgroundVideoMaxFiles
          : DEFAULT_LIMITS.backgroundVideoMaxFiles,
      backgroundVideoMaxStorageMb:
        typeof nextLimits.backgroundVideoMaxStorageMb === "number"
          ? nextLimits.backgroundVideoMaxStorageMb
          : DEFAULT_LIMITS.backgroundVideoMaxStorageMb,
      backgroundVideoMaxFileSizeMb:
        typeof nextLimits.backgroundVideoMaxFileSizeMb === "number"
          ? nextLimits.backgroundVideoMaxFileSizeMb
          : DEFAULT_LIMITS.backgroundVideoMaxFileSizeMb,
    });
  }, []);

  const loadVideos = useCallback(async (options?: { clearMessage?: boolean }) => {
    if (options?.clearMessage !== false) {
      setMessage("");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage(labels.loginRequired);
      return;
    }

    const { data, error } = await supabase.storage
      .from("background-videos")
      .list(user.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    const videoList =
      data
        ?.filter((item) => {
          const name = item.name.toLowerCase();
          return (
            name.endsWith(".mp4") ||
            name.endsWith(".mov") ||
            name.endsWith(".webm")
          );
        })
        .map((item) => {
          const path = `${user.id}/${item.name}`;
          const { data: publicUrlData } = supabase.storage
            .from("background-videos")
            .getPublicUrl(path);

          return {
            name: toDisplayFileName(item.name),
            path,
            url: publicUrlData.publicUrl,
            size: item.metadata?.size,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)) ?? [];

    setVideos(videoList);
    setSelectedPath((current) => {
      if (current && videoList.some((video) => video.path === current)) {
        return current;
      }
      return videoList[0]?.path ?? "";
    });
  }, [labels.loginRequired, supabase]);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) return;

    const safeFileName = sanitizeFileName(file.name);

    if (!safeFileName) {
      setMessage(textFor("파일 이름을 확인해주세요.", "Check the file name."));
      event.target.value = "";
      return;
    }

    if (videos.length >= limits.backgroundVideoMaxFiles) {
      setMessage(labels.maxFiles(limits.backgroundVideoMaxFiles));
      event.target.value = "";
      return;
    }

    const maxBytes = limits.backgroundVideoMaxFileSizeMb * 1024 * 1024;

    if (file.size > maxBytes) {
      setMessage(labels.maxSize(limits.backgroundVideoMaxFileSizeMb));
      event.target.value = "";
      return;
    }

    const nextUsedStorageMb = usedStorageMb + file.size / 1024 / 1024;

    if (nextUsedStorageMb > limits.backgroundVideoMaxStorageMb) {
      setMessage(labels.maxStorage(limits.backgroundVideoMaxStorageMb));
      event.target.value = "";
      return;
    }

    if (!file.type.startsWith("video/")) {
      setMessage(labels.videoOnly);
      event.target.value = "";
      return;
    }

    const allowedExtensions = ["mp4", "mov", "webm"];
    const fileExt = safeFileName.split(".").pop()?.toLowerCase();

    if (!fileExt || !allowedExtensions.includes(fileExt)) {
      setMessage(labels.allowedTypes);
      event.target.value = "";
      return;
    }

    const storageFileName = toStorageFileName(safeFileName, fileExt);

    if (
      videos.some(
        (video) =>
          video.name === safeFileName ||
          video.path.endsWith(`/${storageFileName}`)
      )
    ) {
      setMessage(labels.duplicateName);
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    setMessage(labels.uploading);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage(labels.loginRequired);
        return;
      }

      const uploadUrlResponse = await fetch("/api/background-videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageFileName,
          contentType: file.type,
          size: file.size,
        }),
      });
      const uploadUrlData = await uploadUrlResponse.json().catch(() => null);
      if (!uploadUrlResponse.ok) {
        throw new Error(
          typeof uploadUrlData?.error === "string"
            ? uploadUrlData.error
            : labels.uploadError
        );
      }

      const filePath = typeof uploadUrlData?.path === "string" ? uploadUrlData.path : "";
      const uploadToken = typeof uploadUrlData?.token === "string" ? uploadUrlData.token : "";
      if (!filePath || !uploadToken) throw new Error(labels.uploadError);

      const { error } = await supabase.storage
        .from("background-videos")
        .uploadToSignedUrl(filePath, uploadToken, file, {
          contentType: file.type,
        });

      if (error) {
        setMessage(error.message);
        return;
      }

      setSelectedPath(filePath);
      await loadVideos({ clearMessage: false });
      setMessage(labels.uploaded);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : labels.uploadError);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleDelete(video: BackgroundVideo) {
    setDeleteConfirmPath("");
    setIsDeletingPath(video.path);
    setMessage(labels.deleting);

    try {
      const { error } = await supabase.storage
        .from("background-videos")
        .remove([video.path]);

      if (error) {
        setMessage(error.message);
        return;
      }

      await loadVideos({ clearMessage: false });
      setMessage(labels.deleted);
    } catch {
      setMessage(labels.deleteError);
    } finally {
      setIsDeletingPath("");
    }
  }

  function requestDelete(video: BackgroundVideo) {
    setDeleteConfirmPath(video.path);
    setMessage("");
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPlanLimits();
      void loadVideos();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPlanLimits, loadVideos]);

  useEffect(() => {
    if (message !== labels.uploaded && message !== labels.deleted) return;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [labels.deleted, labels.uploaded, message]);

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            {textFor("배경 영상 관리", "Background videos")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            {textFor(
              "프로젝트에서 사용할 개인 배경 영상을 관리합니다.",
              "Manage personal background videos for projects."
            )}
          </p>
        </div>

        <div className="text-left md:text-right">
          <p className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-neutral-400">
            {videos.length}/{limits.backgroundVideoMaxFiles}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {labels.storageUsage(
              usedStorageMb.toFixed(1),
              limits.backgroundVideoMaxStorageMb
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
        <label className="block text-sm font-medium text-neutral-300">
          {labels.uploadLabel}
        </label>
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          {labels.uploadLimit(
            limits.backgroundVideoMaxFiles,
            limits.backgroundVideoMaxFileSizeMb,
            limits.backgroundVideoMaxStorageMb
          )}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            id={uploadInputId}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={handleUpload}
            disabled={isUploading}
            className="sr-only"
          />
          <label
            htmlFor={uploadInputId}
            className={`inline-flex cursor-pointer items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${
              isUploading
                ? "pointer-events-none bg-white/50 text-black"
                : "bg-white text-black hover:bg-neutral-200"
            }`}
          >
            {isUploading ? labels.uploading : labels.uploadAction}
          </label>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {textFor(
            "업로드한 파일은 원래 파일 이름 그대로 저장됩니다.",
            "Uploaded files keep their original file names."
          )}
        </p>
      </div>

      {message && (
        <InlineStatus
          className="mt-4"
          tone={
            message === labels.uploaded || message === labels.deleted
              ? "success"
              : message === labels.uploading || message === labels.deleting
                ? "info"
                : "error"
          }
        >
          {message}
        </InlineStatus>
      )}

      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {selectedVideo ? (
            <div className="grid aspect-video min-h-56 place-items-center bg-black">
              <video
                key={selectedVideo.path}
                src={selectedVideo.url}
                controls
                muted
                className="h-full max-h-[360px] w-full bg-black object-contain"
              />
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center p-5 text-center text-sm text-neutral-500">
              {labels.empty}
            </div>
          )}
        </div>

        <div className="grid min-w-0 content-start gap-2 xl:max-h-[360px] xl:overflow-y-auto xl:pr-1">
          {videos.length > 0 ? (
            videos.map((video) => {
              const isSelected = selectedVideo?.path === video.path;
              const isDeleting = isDeletingPath === video.path;
              const isConfirmingDelete = deleteConfirmPath === video.path;

              return (
                <div
                  key={video.path}
                    className={`min-w-0 rounded-2xl border p-3 transition ${
                    isSelected
                      ? "border-cyan-300/40 bg-cyan-300/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedPath(video.path)}
                    className="block w-full text-left"
                  >
                    <span className="line-clamp-2 break-all text-sm font-semibold leading-5 text-white">
                      {video.name}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      {formatFileSize(video.size)}
                    </span>
                  </button>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:border-white/20 hover:bg-white/10"
                    >
                      {textFor("열기", "Open")}
                    </a>
                    {isConfirmingDelete ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDelete(video)}
                          disabled={isDeleting || isUploading}
                          className="rounded-xl border border-red-400/40 bg-red-400/15 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-400/20 disabled:opacity-50"
                        >
                          {isDeleting ? labels.deleteProgress : labels.delete}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmPath("")}
                          disabled={isDeleting}
                          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
                        >
                          {textFor("취소", "Cancel")}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => requestDelete(video)}
                        disabled={Boolean(isDeletingPath) || isUploading}
                        className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-400/15 disabled:opacity-50"
                      >
                        {labels.delete}
                      </button>
                    )}
                  </div>

                  {isConfirmingDelete ? (
                    <p className="mt-2 text-xs leading-5 text-red-100">
                      {labels.confirmDelete}
                    </p>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-500">
              {labels.empty}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
