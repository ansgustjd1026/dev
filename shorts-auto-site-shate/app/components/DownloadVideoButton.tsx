"use client";

import { useState } from "react";

type Props = {
  videoUrl: string;
  fileName?: string;
  className?: string;
  children?: React.ReactNode;
  loadingLabel?: string;
  disabled?: boolean;
  disabledLabel?: string;
};

export default function DownloadVideoButton({
  videoUrl,
  fileName = "shorts.mp4",
  className = "",
  children = "Download",
  loadingLabel = "Preparing",
  disabled = false,
  disabledLabel,
}: Props) {
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    if (!videoUrl || isDownloading || disabled) return;

    setIsDownloading(true);

    try {
      const response = await fetch(videoUrl);

      if (!response.ok) {
        throw new Error("Could not load the video file.");
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(videoUrl, "_blank");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isDownloading || disabled}
      title={disabled ? disabledLabel : undefined}
      className={className}
    >
      {isDownloading ? loadingLabel : disabled ? disabledLabel ?? children : children}
    </button>
  );
}
