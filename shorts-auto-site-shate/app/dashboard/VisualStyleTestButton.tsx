"use client";

import { useState } from "react";

type StyleResult = {
  style: string;
  ko: string;
  en: string;
  imageUrl: string;
  error: string;
};

export default function VisualStyleTestButton({
  locale,
}: {
  locale: "ko" | "en";
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<StyleResult[]>([]);

  async function runTest() {
    setOpen(true);
    setLoading(true);
    setError("");
    setImages([]);

    try {
      const response = await fetch("/api/test-visual-styles", { method: "POST" });
      const payload = (await response.json()) as {
        images?: StyleResult[];
        error?: string;
      };
      if (!response.ok || !payload.images) {
        throw new Error(payload.error || "STYLE_TEST_FAILED");
      }
      setImages(payload.images);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "STYLE_TEST_FAILED"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={runTest}
        disabled={loading}
        className="min-h-10 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-500 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
      >
        {loading
          ? locale === "ko"
            ? "생성 중"
            : "Generating"
          : locale === "ko"
            ? "스타일 테스트"
            : "Style test"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={locale === "ko" ? "영상 스타일 테스트" : "Visual style test"}
        >
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  {locale === "ko" ? "스타일 비교" : "Style comparison"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {locale === "ko"
                    ? "동일한 구도 · 6가지 스타일 · GPT Image 2 중간 품질"
                    : "Locked composition · 6 styles · GPT Image 2 medium quality"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-xl text-slate-700 hover:bg-slate-50"
                aria-label={locale === "ko" ? "닫기" : "Close"}
              >
                ×
              </button>
            </div>

            {loading ? (
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-500" />
              </div>
            ) : null}

            {error ? (
              <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            {images.length > 0 ? (
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
                {images.map((image) => (
                  <figure
                    key={image.style}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                  >
                    {image.imageUrl ? (
                      // Data URLs are intentionally used only by this local test tool.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={image.imageUrl}
                        alt={locale === "ko" ? image.ko : image.en}
                        className="aspect-[2/3] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[2/3] items-center justify-center p-3 text-center text-xs text-red-600">
                        {image.error}
                      </div>
                    )}
                    <figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                      {locale === "ko" ? image.ko : image.en}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
