"use client";

import { useEffect, useState } from "react";

type Props = {
  videoUrl: string;
  title: string;
  locale: "ko" | "en";
};

export default function FinalVideoPreviewButton({
  videoUrl,
  title,
  locale,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const previewLabel = locale === "ko" ? "미리보기" : "Preview";
  const closeLabel = locale === "ko" ? "닫기" : "Close";

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
      >
        {previewLabel}
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} ${previewLabel}`}
          onMouseDown={() => setIsOpen(false)}
        >
          <section
            className="relative flex max-h-[92vh] w-full max-w-sm flex-col rounded-2xl border border-white/15 bg-slate-950 p-3 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <p className="truncate text-sm font-semibold text-white">{title}</p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/20 bg-white/10 text-sm font-semibold text-white transition hover:bg-white/20"
                aria-label={closeLabel}
              >
                X
              </button>
            </div>
            <video
              src={videoUrl}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="max-h-[82vh] w-full rounded-xl bg-black object-contain"
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
