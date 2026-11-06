import { useEffect } from "react";
import { rankIndexForScore } from "../domain/rank.ts";
import { resolveScenarioName } from "../domain/screens/data.ts";
import type { TrackerData } from "../data/trackerData.ts";

/**
 * "打完一局后通知": when new runs arrive while the page is in the background (the player is in
 * KovaaK), show a system notification with the score, a new PB and the rank reached.
 */
export function useRunNotifications(data: TrackerData) {
  useEffect(
    () =>
      data.onEvent((event) => {
        const snapshot = data.getSnapshot();
        if (!snapshot.preferences.notifyAfterRun || typeof Notification === "undefined" || Notification.permission !== "granted") return;
        if (typeof document !== "undefined" && document.visibilityState === "visible") return;
        const rankNames = Object.keys(snapshot.benchmark.rankColors);
        event.records.slice(-3).forEach((record) => {
          const name = resolveScenarioName(record.scenario, snapshot.benchmark.scenarios, snapshot.aliases);
          const scenario = snapshot.benchmark.scenarios.find((item) => item.name === name);
          const earlier = snapshot.records.filter((item) => item !== record && resolveScenarioName(item.scenario, snapshot.benchmark.scenarios, snapshot.aliases) === name);
          const isPb = Boolean(name) && earlier.length > 0 && earlier.every((item) => item.score < record.score);
          const rankIndex = scenario ? rankIndexForScore(record.score, scenario.rankMaxes ?? []) : -1;
          const parts = [`${record.score} 分`, isPb ? "新的个人最佳" : null, rankIndex >= 0 ? rankNames[rankIndex] : null].filter(Boolean);
          new Notification(name ?? record.scenario, { body: parts.join(" · "), tag: `run-${record.id ?? record.date}` });
        });
      }),
    [data],
  );
}

/** Asks for notification permission; call from a click so the browser shows the prompt. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}
