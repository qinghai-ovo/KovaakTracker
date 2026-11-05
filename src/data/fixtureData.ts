import { toggleRecordCounted } from "../domain/exclusions.ts";
import { defaultScreenSettings } from "../domain/screens/shared.ts";
import { average } from "../domain/stats.ts";
import { sameScenario } from "../domain/scenario.ts";
import type { ScoreRecord } from "../domain/types.ts";
import { NOW, demoDataset, rankColors } from "./fixtures/designSample.ts";
import type { TrackerData, TrackerEvent, TrackerSnapshot } from "./trackerData.ts";

function localIso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function newestLocalTime(records: ScoreRecord[]): string | null {
  const newest = records.reduce<string | null>((latest, record) => (latest === null || record.date > latest ? record.date : latest), null);
  return newest ? newest.slice(11, 16) : null;
}

/** In-memory data source with the design canvas sample data; works in any browser. */
export function createFixtureData(): TrackerData {
  const dataset = demoDataset();
  let clock = new Date(NOW);
  const todayStart = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 4);
  let snapshot: TrackerSnapshot = {
    source: "fixture",
    benchmark: { name: "Viscose S2", difficulty: "Easier", scenarios: dataset.scenarios, rankColors },
    records: dataset.records,
    exclusions: {},
    plan: dataset.plan,
    settings: { ...defaultScreenSettings },
    now: clock,
    lastImportAt: newestLocalTime(dataset.records.filter((record) => new Date(record.date) >= todayStart)),
    watching: true,
  };
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: TrackerEvent) => void>();

  function update(next: Partial<TrackerSnapshot>) {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    toggleRunCounted(record, currentlyCounts) {
      update({ exclusions: toggleRecordCounted(record, snapshot.exclusions, currentlyCounts, clock.toISOString()) });
    },
    addToPlan(scenarioName, targetRuns = 3) {
      if (snapshot.plan.some((item) => sameScenario(item.scenarioName, scenarioName))) return;
      update({ plan: [...snapshot.plan, { scenarioName, targetRuns }] });
    },
    simulateRun(scenarioName) {
      const recent = snapshot.records.filter((record) => sameScenario(record.scenario, scenarioName)).slice(-10);
      const base = average(recent.map((record) => record.score)) ?? 1000;
      clock = new Date(clock.getTime() + 2 * 60 * 1000);
      const date = localIso(clock);
      const record: ScoreRecord = {
        id: `demo|${scenarioName}|${date}`,
        scenario: scenarioName,
        score: Math.round(base * (0.94 + Math.random() * 0.18)),
        date,
        source: "csv",
      };
      update({ records: [...snapshot.records, record], now: clock, lastImportAt: date.slice(11, 16) });
      eventListeners.forEach((listener) => listener({ type: "runs:added", records: [record] }));
    },
  };
}
