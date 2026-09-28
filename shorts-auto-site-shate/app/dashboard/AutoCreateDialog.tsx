"use client";

import { useEffect, useState } from "react";
import type { SiteLocale } from "@/lib/i18n/config";
import type { DefaultAutoVisualMode } from "@/lib/preferences/config";
import Button from "@/app/components/ui/Button";

type Props = {
  locale: SiteLocale;
  disabled?: boolean;
  disabledReason?: string;
  defaultMode?: DefaultAutoVisualMode;
};

export default function AutoCreateButton({
  locale,
  disabled = false,
  disabledReason,
  defaultMode = "images",
}: Props) {
  const isKorean = locale === "ko";
  const [isOpen, setIsOpen] = useState(false);
  const [topic, setTopic] = useState("");

  function startAutomation() {
    window.dispatchEvent(
      new CustomEvent("shate:auto-create", {
        detail: { visual: defaultMode, topic: topic.trim() },
      })
    );
    setIsOpen(false);
    setTopic("");
  }

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <div className="group relative">
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className="disabled:border-slate-300 disabled:bg-white disabled:text-slate-400 disabled:opacity-100"
      >
        {isKorean ? "자동 제작" : "Auto-create"}
      </Button>
      {disabled && disabledReason ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-max max-w-64 rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white shadow-lg group-hover:block"
        >
          {disabledReason}
        </span>
      ) : null}
      {isOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auto-create-dialog-title"
          onMouseDown={() => setIsOpen(false)}
        >
          <form
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              startAutomation();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="auto-create-dialog-title"
                  className="text-xl font-bold text-slate-950"
                >
                  {isKorean ? "자동 제작" : "Auto-create"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {isKorean
                    ? "만들고 싶은 쇼츠의 주제만 입력하세요."
                    : "Enter only the topic for your Short."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                aria-label={isKorean ? "닫기" : "Close"}
              >
                X
              </button>
            </div>

            <label
              htmlFor="auto-create-topic"
              className="mt-6 block text-sm font-semibold text-slate-900"
            >
              {isKorean ? "주제" : "Topic"}
            </label>
            <textarea
              id="auto-create-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              maxLength={300}
              rows={3}
              autoFocus
              placeholder={
                isKorean
                  ? "비워두면 주제를 자동으로 정합니다."
                  : "Leave blank to generate a random topic."
              }
              className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-sky-500/15"
            />

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsOpen(false)}
                fullWidth
              >
                {isKorean ? "취소" : "Cancel"}
              </Button>
              <Button type="submit" fullWidth>
                {isKorean ? "시작" : "Start"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
