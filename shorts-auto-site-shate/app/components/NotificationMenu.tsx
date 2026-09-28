"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SiteLocale } from "@/lib/i18n/config";
import {
  CLIENT_NOTIFICATION_EVENT,
  dismissNotification,
  markNotificationsRead,
  readDismissedNotificationIds,
  readClientNotifications,
  readNotificationIds,
  type ClientNotificationItem,
} from "@/lib/notifications/client";

type NotificationItem = ClientNotificationItem;

type Props = {
  locale: SiteLocale;
};

export default function NotificationMenu({ locale }: Props) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const isKorean = locale === "ko";

  function formatNotificationTime(value?: string) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat(isKorean ? "ko-KR" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  useEffect(() => {
    let active = true;
    const storedNotifications = readClientNotifications();
    const dismissedNotificationIds = readDismissedNotificationIds();

    queueMicrotask(() => {
      if (!active) return;
      setNotifications(storedNotifications.filter((notification) => !dismissedNotificationIds.has(notification.id)));
      setReadIds(readNotificationIds());
    });

    void fetch("/api/notifications", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | { notifications?: NotificationItem[] }
          | null;
        if (active && response.ok) {
          const apiNotifications = Array.isArray(data?.notifications)
            ? data.notifications.filter((notification) => !dismissedNotificationIds.has(notification.id))
            : [];
          setNotifications((current) => [
            ...current,
            ...apiNotifications.filter(
              (notification) =>
                !current.some((stored) => stored.id === notification.id)
            ),
          ]);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleClientNotification = (event: Event) => {
      const notification = (event as CustomEvent<NotificationItem>).detail;
      if (!notification?.id) return;

      setNotifications((current) => [
        notification,
        ...current.filter((item) => item.id !== notification.id),
      ]);
      setReadIds((current) => {
        const next = new Set(current);
        next.delete(notification.id);
        return next;
      });
    };

    window.addEventListener(CLIENT_NOTIFICATION_EVENT, handleClientNotification);
    return () =>
      window.removeEventListener(CLIENT_NOTIFICATION_EVENT, handleClientNotification);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const closeMenu = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function toggleMenu() {
    setIsOpen((current) => {
      const next = !current;
      if (next) {
        const ids = notifications.map((notification) => notification.id);
        markNotificationsRead(ids);
        setReadIds((previous) => new Set([...previous, ...ids]));
        const persistentIds = notifications
          .filter((notification) => notification.persistent)
          .map((notification) => notification.id);
        if (persistentIds.length > 0) {
          void fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notificationIds: persistentIds }),
          });
        }
      }
      return next;
    });
  }

  function removeNotification(notification: NotificationItem) {
    if (notification.persistent) {
      void fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notification.id }),
      });
    } else {
      dismissNotification(notification.id);
    }
    setNotifications((current) => current.filter((item) => item.id !== notification.id));
    setReadIds((current) => {
      const next = new Set(current);
      next.delete(notification.id);
      return next;
    });
  }

  const hasUnread = notifications.some((notification) => !readIds.has(notification.id));

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggleMenu}
        aria-label={isKorean ? "알림" : "Notifications"}
        aria-expanded={isOpen}
        className="relative grid h-10 w-10 place-items-center rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm transition hover:border-slate-500 hover:bg-slate-100"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {hasUnread ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sky-500 ring-2 ring-white" />
        ) : null}
      </button>

      {isOpen ? (
        <section className="absolute right-0 top-full z-[110] mt-2 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">
              {isKorean ? "알림" : "Notifications"}
            </h2>
          </div>

          {isLoading ? (
            <p className="px-4 py-5 text-sm text-slate-500">
              {isKorean ? "확인 중" : "Checking"}
            </p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-5 text-sm text-slate-500">
              {isKorean ? "새 알림이 없습니다." : "No new notifications."}
            </p>
          ) : (
            <div className="p-2">
              {notifications.map((notification) => (
                <article key={notification.id} className="rounded-lg bg-slate-50 p-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        readIds.has(notification.id) ? "bg-slate-300" : "bg-sky-500"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-950">
                        {notification.id === "connect-youtube-account" && !isKorean
                          ? "Connect Google account"
                          : notification.title}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {notification.id === "connect-youtube-account" && !isKorean
                          ? "Connect your Google account to publish to YouTube."
                          : notification.message}
                      </p>
                      {formatNotificationTime(notification.createdAt) ? (
                        <time
                          dateTime={notification.createdAt}
                          className="mt-1 block text-[11px] text-slate-400"
                        >
                          {formatNotificationTime(notification.createdAt)}
                        </time>
                      ) : null}
                      {notification.actionHref && notification.actionLabel ? (
                        <Link
                          href={notification.actionHref}
                          className="mt-3 inline-flex min-h-8 items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          {notification.id === "connect-youtube-account" && !isKorean
                            ? "Connect"
                            : notification.actionLabel}
                        </Link>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNotification(notification)}
                      aria-label={isKorean ? "알림 삭제" : "Dismiss notification"}
                      title={isKorean ? "알림 삭제" : "Dismiss"}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-lg leading-none text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
