"use client";

import { useState } from "react";
import Button from "@/app/components/ui/Button";
import type { SiteLocale } from "@/lib/i18n/config";

type Props = {
  channelTitle: string;
  channelId: string;
  isConnected: boolean;
  isConfigured: boolean;
  connectionMessage?: string;
  locale: SiteLocale;
};

function getText(locale: SiteLocale) {
  if (locale === "ko") {
    return {
      title: "YouTube",
      description: "YouTube Shorts 자동 업로드에 사용할 채널을 연결합니다.",
      setupTitle: "자동 게시 연결",
      connected: "연동 완료",
      needed: "연동 필요",
      missingConfig: "Google OAuth 설정 필요",
      connect: "연동",
      disconnect: "연동 해제",
      disconnectConfirm: "YouTube 연동을 해제할까요? 저장된 연결 정보가 삭제됩니다.",
      disconnectError: "YouTube 연동 해제에 실패했습니다.",
      disconnecting: "해제 중...",
      ready:
        "완성 영상을 YouTube 채널에 공개로 업로드합니다. 제목과 설명은 게시 전에 설정할 수 있습니다.",
      disabled:
        "Google 계정 승인 후 자동 게시를 사용할 수 있습니다. YouTube 채널이 있는 Google 계정으로 연결하세요.",
      configHelp:
        "서버에 GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 설정해야 연동 버튼이 작동합니다.",
      checklist: "준비 상태",
      account: "Google 계정 승인",
      channel: "YouTube 채널",
      upload: "업로드 권한",
      done: "완료",
      need: "필요",
      channelNeeded: "채널 필요",
      channelHelp:
        "YouTube에서 채널을 만든 뒤 연동을 해제하고 다시 연결하세요.",
      channelMissing: "채널 생성 필요",
    };
  }

  return {
    title: "YouTube",
    description: "Connect the channel used for YouTube Shorts uploads.",
    setupTitle: "Auto-post connection",
    connected: "Connected",
    needed: "Connect required",
    missingConfig: "Google OAuth setup needed",
    connect: "Connect",
    disconnect: "Disconnect",
    disconnectConfirm: "Disconnect YouTube? The saved connection will be removed.",
    disconnectError: "Could not disconnect YouTube.",
    disconnecting: "Disconnecting...",
    ready:
      "Final videos are uploaded publicly by default. You can set the title, description, and visibility before uploading.",
    disabled:
      "Connect a Google account with a YouTube channel to enable auto-posting.",
    configHelp:
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server before connecting.",
    checklist: "Setup status",
    account: "Google consent",
    channel: "YouTube channel",
    upload: "Upload permission",
    done: "Done",
    need: "Needed",
    channelNeeded: "Channel needed",
    channelHelp:
      "Create a YouTube channel, then disconnect and connect again.",
    channelMissing: "Create channel",
  };
}

export default function YouTubeProfileSettings({
  channelTitle,
  channelId,
  isConnected,
  isConfigured,
  connectionMessage = "",
  locale,
}: Props) {
  const text = getText(locale);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState("");
  const hasChannel = Boolean(channelId);
  const isReady = isConnected && hasChannel;
  const statusLabel = isReady
    ? text.connected
    : isConnected
      ? text.channelNeeded
    : isConfigured
      ? text.needed
      : text.missingConfig;
  const statusClass = isReady
    ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
    : isConnected
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
    : isConfigured
      ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
      : "border-neutral-500/30 bg-white/[0.04] text-neutral-400";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-2xl font-semibold">{text.title}</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          {text.description}
        </p>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {text.setupTitle}
              </p>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}
              >
                {statusLabel}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {isReady
                ? text.ready
                : isConnected
                  ? text.channelHelp
                  : text.disabled}
            </p>
            {hasChannel ? (
              <p className="mt-2 text-xs leading-5 text-cyan-800">
                {channelTitle}
              </p>
            ) : null}
            {connectionMessage ? (
              <p className="mt-2 text-xs leading-5 text-neutral-500">
                {connectionMessage}
              </p>
            ) : null}
          </div>

          {isConnected ? (
            <Button
              type="button"
              variant="danger"
              disabled={isDisconnecting}
              onClick={async () => {
                if (!window.confirm(text.disconnectConfirm)) return;
                setIsDisconnecting(true);
                setDisconnectError("");
                try {
                  const response = await fetch("/api/youtube/connect", {
                    method: "DELETE",
                  });
                  const data = await response.json().catch(() => null);
                  if (!response.ok) {
                    throw new Error(
                      typeof data?.error === "string"
                        ? data.error
                        : text.disconnectError
                    );
                  }
                  window.location.reload();
                } catch (error: unknown) {
                  setDisconnectError(
                    error instanceof Error ? error.message : text.disconnectError
                  );
                  setIsDisconnecting(false);
                }
              }}
              className="shrink-0 rounded-xl px-4 py-2"
            >
              {isDisconnecting ? text.disconnecting : text.disconnect}
            </Button>
          ) : isConfigured ? (
            <a
              href="/api/youtube/connect"
              className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              {text.connect}
            </a>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled
              className="shrink-0 rounded-xl px-4 py-2"
            >
              {text.connect}
            </Button>
          )}
        </div>

        {disconnectError ? (
          <p className="mt-3 text-xs leading-5 text-red-200">{disconnectError}</p>
        ) : null}

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {text.checklist}
          </p>
          <div className="mt-3 grid gap-2">
            {[
              { label: text.account, done: isConnected },
              { label: text.channel, done: hasChannel },
              { label: text.upload, done: isReady },
            ].map((item) => (
              <div
                key={item.label}
                className="grid gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                <span
                  className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    item.done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {item.done
                    ? text.done
                    : item.label === text.channel
                      ? text.channelMissing
                      : text.need}
                </span>
              </div>
            ))}
          </div>
        </div>

        {!isConfigured ? (
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            {text.configHelp}
          </p>
        ) : null}
      </div>
    </section>
  );
}
