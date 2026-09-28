export type ClientNotificationItem = {
  id: string;
  type: "action" | "message";
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  createdAt?: string;
  persistent?: boolean;
};

export const CLIENT_NOTIFICATION_EVENT = "shate:notification";

const STORAGE_KEY = "shate:client-notifications";
const READ_STORAGE_KEY = "shate:read-notifications";
const DISMISSED_STORAGE_KEY = "shate:dismissed-notifications";
const MAX_NOTIFICATIONS = 20;

function readNotificationIdSet(storageKey: string) {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string").slice(-MAX_NOTIFICATIONS)
        : []
    );
  } catch {
    return new Set<string>();
  }
}

function writeNotificationIdSet(storageKey: string, ids: Set<string>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...ids].slice(-MAX_NOTIFICATIONS)));
  } catch {
    // Notification state remains available for the current page when storage is unavailable.
  }
}

export function readNotificationIds() {
  return readNotificationIdSet(READ_STORAGE_KEY);
}

export function readDismissedNotificationIds() {
  return readNotificationIdSet(DISMISSED_STORAGE_KEY);
}

export function markNotificationsRead(ids: Iterable<string>) {
  const next = readNotificationIds();
  for (const id of ids) next.add(id);
  writeNotificationIdSet(READ_STORAGE_KEY, next);
}

export function dismissNotification(id: string) {
  const dismissed = readDismissedNotificationIds();
  dismissed.add(id);
  writeNotificationIdSet(DISMISSED_STORAGE_KEY, dismissed);

  if (typeof window === "undefined") return;
  try {
    const next = readClientNotifications().filter((notification) => notification.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The current component state still removes the notification.
  }
}

export function readClientNotifications(): ClientNotificationItem[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_NOTIFICATIONS) : [];
  } catch {
    return [];
  }
}

export function addClientNotification(item: ClientNotificationItem) {
  if (typeof window === "undefined") return;

  const notification = {
    ...item,
    createdAt: item.createdAt ?? new Date().toISOString(),
  };

  const dismissed = readDismissedNotificationIds();
  dismissed.delete(notification.id);
  writeNotificationIdSet(DISMISSED_STORAGE_KEY, dismissed);

  const read = readNotificationIds();
  read.delete(notification.id);
  writeNotificationIdSet(READ_STORAGE_KEY, read);

  const next = [
    notification,
    ...readClientNotifications().filter((stored) => stored.id !== notification.id),
  ].slice(0, MAX_NOTIFICATIONS);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The live event still updates the current page when storage is unavailable.
  }

  window.dispatchEvent(
    new CustomEvent<ClientNotificationItem>(CLIENT_NOTIFICATION_EVENT, {
      detail: notification,
    })
  );
}
