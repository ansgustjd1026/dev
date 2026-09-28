"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import InlineStatus from "@/app/components/ui/InlineStatus";

type BackgroundVideo = {
  name: string;
  path: string;
  url: string;
  size?: number;
  isGlobal?: boolean;
};

type Props = {
  selectedVideoPath: string;
  labels: {
    uploadLabel: string;
    uploadAction: string;
    randomSelect: string;
    recommendedTab: string;
    myTab: string;
    uploadLimit: (count: number, fileSize: number, storageSize: number) => string;
    loginRequired: string;
    maxFiles: (count: number) => string;
    maxSize: (size: number) => string;
    maxStorage: (size: number) => string;
    storageUsage: (used: string, total: number) => string;
    videoOnly: string;
    allowedTypes: string;
    uploading: string;
    uploaded: string;
    uploadError: string;
    duplicateName: string;
    confirmDelete: string;
    deleting: string;
    deleted: string;
    deleteError: string;
    selected: string;
    select: string;
    delete: string;
    deleteProgress: string;
    empty: string;
    globalEmpty: string;
  };
  onSelect: (video: BackgroundVideo) => void;
  onDeletedSelected?: () => void;
};

const DEFAULT_LIMITS = {
  backgroundVideoMaxFiles: 3,
  backgroundVideoMaxStorageMb: 150,
  backgroundVideoMaxFileSizeMb: 50,
};

type BackgroundVideoLimits = typeof DEFAULT_LIMITS;

async function ensureStorageBucket(bucket: string) {
  const response = await fetch("/api/storage/ensure-bucket", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bucket }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Storage bucket could not be prepared."
    );
  }
}

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

export default function BackgroundVideoPicker({
  selectedVideoPath,
  labels,
  onSelect,
  onDeletedSelected,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const uploadInputId = useId();

  const [videos, setVideos] = useState<BackgroundVideo[]>([]);
  const [globalVideos, setGlobalVideos] = useState<BackgroundVideo[]>([]);
  const [activeTab, setActiveTab] = useState<"global" | "mine">("global");
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingPath, setIsDeletingPath] = useState("");
  const [limits, setLimits] = useState<BackgroundVideoLimits>(DEFAULT_LIMITS);

  function formatFileSize(bytes?: number) {
    if (!bytes) return "";

    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)}MB`;
  }

  function getUsedStorageMb() {
    const bytes = videos.reduce((sum, video) => sum + (video.size ?? 0), 0);
    return bytes / 1024 / 1024;
  }

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

  const loadVideos = useCallback(async () => {
    setMessage("");

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
        }) ?? [];

    setVideos(videoList);
  }, [labels.loginRequired, supabase]);

  const loadGlobalVideos = useCallback(async () => {
    const { data, error } = await supabase.storage
      .from("background-videos")
      .list("global");

    if (error) return;

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
          const path = `global/${item.name}`;

          const { data: publicUrlData } = supabase.storage
            .from("background-videos")
            .getPublicUrl(path);

          return {
            name: toDisplayFileName(item.name),
            path,
            url: publicUrlData.publicUrl,
            size: item.metadata?.size,
            isGlobal: true,
          };
        }) ?? [];

    setGlobalVideos(videoList);
  }, [supabase]);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) return;

    const safeFileName = sanitizeFileName(file.name);

    if (!safeFileName) {
      setMessage(labels.uploadError);
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

    const nextUsedStorageMb = getUsedStorageMb() + file.size / 1024 / 1024;

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

      const filePath = `${user.id}/${storageFileName}`;

      await ensureStorageBucket("background-videos");

      const { error } = await supabase.storage
        .from("background-videos")
        .upload(filePath, file, {
          contentType: file.type,
        });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage(labels.uploaded);
      setActiveTab("mine");
      await loadVideos();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : labels.uploadError);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleDelete(video: BackgroundVideo) {
    const ok = window.confirm(labels.confirmDelete);

    if (!ok) return;

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

      if (selectedVideoPath === video.path) {
        onDeletedSelected?.();
      }

      setMessage(labels.deleted);
      await loadVideos();
    } catch {
      setMessage(labels.deleteError);
    } finally {
      setIsDeletingPath("");
    }
  }

  function handleRandomSelect() {
    if (videos.length === 0) return;

    const candidates =
      videos.length > 1
        ? videos.filter((video) => video.path !== selectedVideoPath)
        : videos;
    const video = candidates[Math.floor(Math.random() * candidates.length)];

    if (!video) return;
    setActiveTab("mine");
    onSelect(video);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPlanLimits();
      void loadGlobalVideos();
      void loadVideos();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadGlobalVideos, loadPlanLimits, loadVideos]);

  const usedStorageMb = getUsedStorageMb();
  const displayedVideos = activeTab === "global" ? globalVideos : videos;
  const emptyMessage = activeTab === "global" ? labels.globalEmpty : labels.empty;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-5 sm:rounded-2xl sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-800">
            {labels.uploadLabel}
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {labels.uploadLimit(
              limits.backgroundVideoMaxFiles,
              limits.backgroundVideoMaxFileSizeMb,
              limits.backgroundVideoMaxStorageMb
            )}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1">
          <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {videos.length}/{limits.backgroundVideoMaxFiles}
          </p>
          <p className="text-xs text-slate-500">
            {labels.storageUsage(
              usedStorageMb.toFixed(1),
              limits.backgroundVideoMaxStorageMb
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
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
          className={`inline-flex min-w-0 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition ${
            isUploading
              ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
              : "border-slate-950 bg-slate-950 text-white hover:bg-slate-800"
          }`}
        >
          {isUploading ? labels.uploading : labels.uploadAction}
        </label>
        <button
          type="button"
          onClick={handleRandomSelect}
          disabled={isUploading || videos.length === 0}
          className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {labels.randomSelect}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:mt-5">
        <button
          type="button"
          onClick={() => setActiveTab("global")}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            activeTab === "global"
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-500 hover:bg-white hover:text-slate-950"
          }`}
        >
          {labels.recommendedTab}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("mine")}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            activeTab === "mine"
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-500 hover:bg-white hover:text-slate-950"
          }`}
        >
          {labels.myTab}
        </button>
      </div>

      {displayedVideos.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {displayedVideos.map((video) => {
            const isSelected = selectedVideoPath === video.path;
            const isDeleting = isDeletingPath === video.path;

            return (
              <div
                key={video.path}
                className={`rounded-2xl border p-3 transition ${
                  isSelected
                    ? "border-cyan-300/40 bg-cyan-300/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(video)}
                  className="block w-full text-left"
                  disabled={isDeleting || isUploading}
                >
                  <span className="block text-sm font-semibold text-white">
                    {video.name}
                  </span>

                  <span className="mt-1 block text-xs text-neutral-500">
                    {isSelected ? labels.selected : labels.select}
                    {video.size ? ` · ${formatFileSize(video.size)}` : ""}
                  </span>
                </button>

                {!video.isGlobal && (
                  <button
                    type="button"
                    onClick={() => handleDelete(video)}
                    disabled={isDeleting || isUploading}
                    className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-400/15 disabled:opacity-50"
                  >
                    {isDeleting ? labels.deleteProgress : labels.delete}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-500">
          {emptyMessage}
        </p>
      )}

      {message ? (
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
      ) : null}
    </div>
  );
}
