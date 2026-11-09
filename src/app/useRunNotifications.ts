import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { TrackerData } from "../data/trackerData.ts";
import { freshRuns, playerIsElsewhere, runNotice, type RunNotice } from "./runNotice.ts";

/**
 * "打完一局后通知": when new runs arrive while the player is elsewhere (in KovaaK, or the desktop
 * app is in the tray), show a system notification with the score, a new PB and the rank reached.
 * The desktop app uses Windows notifications; the browser its own.
 */
export function useRunNotifications(data: TrackerData) {
  useEffect(
    () =>
      data.onEvent((event) => {
        const snapshot = data.getSnapshot();
        const fresh = freshRuns(event.records, new Date());
        if (!snapshot.preferences.notifyAfterRun || !fresh.length) return;
        void elsewhere().then((away) => {
          if (away) fresh.forEach((record) => void show(runNotice(record, snapshot)));
        });
      }),
    [data],
  );
}

/**
 * Whether the player is away from the app. A desktop window hidden in the tray still tells its
 * page it is visible and focused, so the desktop app asks the window itself.
 */
async function elsewhere(): Promise<boolean> {
  if (isTauri()) {
    try {
      const window = getCurrentWindow();
      const [visible, minimized, focused] = await Promise.all([window.isVisible(), window.isMinimized(), window.isFocused()]);
      return !visible || minimized || !focused;
    } catch {
      return true;
    }
  }
  return playerIsElsewhere(typeof document === "undefined" ? undefined : document);
}

async function show(notice: RunNotice) {
  if (isTauri()) {
    if (await isPermissionGranted()) sendNotification({ title: notice.title, body: notice.body });
    return;
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(notice.title, { body: notice.body, tag: notice.tag });
  }
}

/** Asks for notification permission; call from a click so the browser shows the prompt. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (isTauri()) return (await isPermissionGranted()) || (await requestPermission()) === "granted";
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

/** True when the browser has been told not to let this page notify. */
export function notificationsBlocked(): boolean {
  return !isTauri() && typeof Notification !== "undefined" && Notification.permission === "denied";
}
