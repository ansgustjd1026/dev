"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/ui/Button";
import InlineStatus from "@/app/components/ui/InlineStatus";
import PlanUpgradeDialog from "@/app/components/PlanUpgradeDialog";
import type { SiteLocale } from "@/lib/i18n/config";

type Props = {
  projectId: string;
  projectTitle: string;
  finalVideoUrl: string;
  youtubeChannelTitle: string;
  isYouTubeConnected: boolean;
  canPublishToYouTube: boolean;
  initialYouTubePrivacy: "private" | "unlisted" | "public";
  initialYouTubePinnedComment?: string;
  initialYouTubePublishEvent?: { id: string; status: string } | null;
  locale: SiteLocale;
  labels: { empty: string };
};

export default function FinalStep({
  projectId,
  projectTitle,
  finalVideoUrl,
  youtubeChannelTitle,
  isYouTubeConnected,
  canPublishToYouTube,
  initialYouTubePrivacy,
  initialYouTubePinnedComment = "",
  initialYouTubePublishEvent = null,
  locale,
  labels,
}: Props) {
  const [publishMessage, setPublishMessage] = useState("");
  const [publishJobId, setPublishJobId] = useState(
    initialYouTubePublishEvent?.id ?? ""
  );
  const [publishStatus, setPublishStatus] = useState(
    initialYouTubePublishEvent?.status ?? ""
  );
  const [isPublishingToYouTube, setIsPublishingToYouTube] = useState(false);
  const [isPublishedToYouTube, setIsPublishedToYouTube] = useState(
    initialYouTubePublishEvent?.status === "published"
  );
  const [youtubeTitle, setYouTubeTitle] = useState(projectTitle);
  const [youtubeDescription, setYouTubeDescription] = useState(projectTitle);
  const [youtubePinnedComment, setYouTubePinnedComment] = useState(
    initialYouTubePinnedComment
  );
  const [youtubePrivacyStatus, setYouTubePrivacyStatus] = useState<
    "private" | "unlisted" | "public"
  >(initialYouTubePrivacy);
  const isPublishPending = publishStatus === "queued" || publishStatus === "uploading";
  const youtubeText =
    locale === "ko"
      ? {
          title: "YouTube",
          connected: youtubeChannelTitle || "연동된 채널",
          notConnected: "연동된 YouTube 채널이 없습니다.",
          connect: "연동",
          publish: "업로드",
          reupload: "재업로드",
          publishing: "업로드 중",
          published: "업로드 완료",
          error: "YouTube 업로드에 실패했습니다.",
          queued: "YouTube 업로드 요청이 등록되었습니다.",
          processing: "YouTube에 영상을 업로드하고 있습니다.",
          ready: "완성 영상을 YouTube 채널에 공개로 업로드합니다.",
          disabled: "Google 계정 승인 후 YouTube 업로드를 사용할 수 있습니다.",
          statusConnected: "연동 완료",
          statusDisconnected: "연동 필요",
          titleLabel: "게시 제목",
          titlePlaceholder: "YouTube 제목",
          descriptionLabel: "설명 / 캡션",
          descriptionPlaceholder: "영상 설명과 해시태그를 입력하세요.",
          titleCount: "자",
          descriptionCount: "자",
          privacyLabel: "공개 설정",
          pinnedCommentLabel: "게시 후 댓글",
          pinnedCommentPlaceholder: "게시 후 채널 계정으로 남길 댓글",
          pinnedCommentHelp: "댓글은 자동 등록됩니다. 상단 고정은 YouTube Studio에서 직접 처리하세요.",
          private: "비공개",
          unlisted: "일부 공개",
          public: "공개",
          upgrade: "YouTube 업로드는 Starter 이상에서 사용할 수 있습니다.",
          alreadyPublished: "이 완성 영상은 이미 YouTube에 업로드되었습니다.",
          alreadyProcessing: "이 완성 영상은 이미 YouTube 업로드 처리 중입니다.",
        }
      : {
          title: "YouTube",
          connected: youtubeChannelTitle || "Connected channel",
          notConnected: "No YouTube channel connected.",
          connect: "Connect",
          publish: "Upload",
          reupload: "Re-upload",
          publishing: "Uploading",
          published: "Uploaded",
          error: "Could not upload to YouTube.",
          queued: "YouTube upload request queued.",
          processing: "Uploading the video to YouTube.",
          ready: "Upload the final video to your YouTube channel as public.",
          disabled: "Connect Google to enable YouTube uploads.",
          statusConnected: "Connected",
          statusDisconnected: "Connect required",
          titleLabel: "Video title",
          titlePlaceholder: "YouTube title",
          descriptionLabel: "Description / caption",
          descriptionPlaceholder: "Add a description and hashtags.",
          titleCount: "chars",
          descriptionCount: "chars",
          privacyLabel: "Visibility",
          pinnedCommentLabel: "Post-upload comment",
          pinnedCommentPlaceholder: "Comment to post from the channel after upload",
          pinnedCommentHelp: "The comment is posted automatically. Pin it manually in YouTube Studio.",
          private: "Private",
          unlisted: "Unlisted",
          public: "Public",
          upgrade: "YouTube uploads are available on Starter and higher.",
          alreadyPublished: "This final video is already uploaded to YouTube.",
          alreadyProcessing: "This final video is already being uploaded to YouTube.",
        };

  useEffect(() => {
    if (!publishJobId || !isPublishPending) return;

    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/youtube/status?jobId=${encodeURIComponent(publishJobId)}`,
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : youtubeText.error
          );
        }

        if (typeof data?.status === "string") {
          setPublishStatus(data.status);
        }

        if (data?.status === "published") {
          setIsPublishedToYouTube(true);
          setPublishMessage(youtubeText.published);
        } else if (data?.status === "error") {
          setPublishMessage(
            typeof data.message === "string"
              ? data.message
              : youtubeText.error
          );
        } else if (data?.status === "uploading") {
          setPublishMessage(youtubeText.processing);
        }
      } catch (error: unknown) {
        setPublishStatus("error");
        setPublishMessage(
          error instanceof Error ? error.message : youtubeText.error
        );
      }
    }, 6000);

    return () => window.clearInterval(intervalId);
  }, [
    isPublishPending,
    publishJobId,
    youtubeText.error,
    youtubeText.processing,
    youtubeText.published,
  ]);

  async function publishToYouTube() {
    setPublishMessage("");
    setIsPublishingToYouTube(true);

    try {
      const response = await fetch("/api/youtube/auto-publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          videoUrl: finalVideoUrl,
          title: youtubeTitle.trim() || projectTitle,
          description: youtubeDescription.trim(),
          pinnedComment: youtubePinnedComment.trim(),
          privacyStatus: youtubePrivacyStatus,
          forceReupload:
            isPublishedToYouTube || publishStatus === "published",
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : youtubeText.error
        );
      }

      if (typeof data?.id === "string") {
        setPublishJobId(data.id);
      }

      if (typeof data?.status === "string") {
        setPublishStatus(data.status);
      }

      if (data?.reused) {
        setPublishMessage(
          data.status === "published"
            ? youtubeText.alreadyPublished
            : youtubeText.alreadyProcessing
        );
        setIsPublishedToYouTube(data.status === "published");
        return;
      }

      if (
        data?.status === "queued" ||
        data?.status === "uploading"
      ) {
        setPublishMessage(
          data.status === "queued"
            ? youtubeText.queued
            : youtubeText.processing
        );
        return;
      }

      setIsPublishedToYouTube(true);
      setPublishMessage(youtubeText.published);
    } catch (error: unknown) {
      setPublishStatus("error");
      setPublishMessage(
        error instanceof Error ? error.message : youtubeText.error
      );
    } finally {
      setIsPublishingToYouTube(false);
    }
  }

  return (
    <div className="w-full shrink-0">
      {finalVideoUrl ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">
                  {youtubeText.title}
                </h3>
                <p className="mt-2 truncate text-xs text-slate-500">
                  {isYouTubeConnected
                    ? youtubeText.connected
                    : youtubeText.notConnected}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  isYouTubeConnected
                    ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                    : "border-slate-200 bg-slate-100 text-slate-500"
                }`}
              >
                {isYouTubeConnected
                  ? youtubeText.statusConnected
                  : youtubeText.statusDisconnected}
              </span>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              {isYouTubeConnected ? youtubeText.ready : youtubeText.disabled}
            </p>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-slate-700">
                  {youtubeText.titleLabel}
                </span>
                <input
                  value={youtubeTitle}
                  onChange={(event) => setYouTubeTitle(event.target.value)}
                  maxLength={100}
                  placeholder={youtubeText.titlePlaceholder}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10"
                />
                <span className="text-right text-[11px] text-slate-500">
                  {youtubeTitle.length}/100 {youtubeText.titleCount}
                </span>
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-slate-700">
                  {youtubeText.pinnedCommentLabel}
                </span>
                <textarea
                  value={youtubePinnedComment}
                  onChange={(event) => setYouTubePinnedComment(event.target.value.slice(0, 10_000))}
                  maxLength={10_000}
                  rows={3}
                  placeholder={youtubeText.pinnedCommentPlaceholder}
                  className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10"
                />
                <span className="text-right text-[11px] text-slate-500">
                  {youtubePinnedComment.length}/10000 {youtubeText.titleCount}
                </span>
                <span className="text-[11px] leading-4 text-slate-500">
                  {youtubeText.pinnedCommentHelp}
                </span>
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-slate-700">
                  {youtubeText.descriptionLabel}
                </span>
                <textarea
                  value={youtubeDescription}
                  onChange={(event) => setYouTubeDescription(event.target.value)}
                  maxLength={5000}
                  rows={3}
                  placeholder={youtubeText.descriptionPlaceholder}
                  className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10"
                />
                <span className="text-right text-[11px] text-slate-500">
                  {youtubeDescription.length}/5000 {youtubeText.descriptionCount}
                </span>
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-slate-700">
                  {youtubeText.privacyLabel}
                </span>
                <select
                  value={youtubePrivacyStatus}
                  onChange={(event) =>
                    setYouTubePrivacyStatus(
                      event.target.value as "private" | "unlisted" | "public"
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10"
                >
                  <option value="public" className="bg-white">
                    {youtubeText.public}
                  </option>
                  <option value="unlisted" className="bg-white">
                    {youtubeText.unlisted}
                  </option>
                  <option value="private" className="bg-white">
                    {youtubeText.private}
                  </option>
                </select>
              </label>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              {isYouTubeConnected ? (
                canPublishToYouTube ? (
                <Button
                  type="button"
                  onClick={() => void publishToYouTube()}
                  disabled={isPublishingToYouTube || isPublishPending}
                  fullWidth
                  className="min-h-11 rounded-xl px-4"
                >
                  {isPublishingToYouTube
                    ? youtubeText.publishing
                    : isPublishedToYouTube || publishStatus === "published"
                      ? youtubeText.reupload
                      : isPublishPending
                        ? youtubeText.processing
                        : youtubeText.publish}
                </Button>
                ) : (
                  <PlanUpgradeDialog
                    locale={locale}
                    feature="youtube"
                    triggerLabel={youtubeText.publish}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  />
                )
              ) : (
                <a
                  href="/profile"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {youtubeText.connect}
                </a>
              )}
            </div>

            {publishMessage && (
              <InlineStatus
                className="mt-3"
                tone={
                  publishStatus === "error"
                    ? "error"
                    : publishStatus === "published"
                      ? "success"
                      : "info"
                }
              >
                {publishMessage}
              </InlineStatus>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-sm text-slate-500">
          {labels.empty}
        </div>
      )}
    </div>
  );
}
