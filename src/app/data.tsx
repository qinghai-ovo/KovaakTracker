import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { mapScreen, type MapView } from "../domain/screens/map.ts";
import type { RankView, ScreenInput } from "../domain/screens/shared.ts";
import { resolveScenarioName } from "../domain/screens/data.ts";
import type { BenchmarkScenario } from "../domain/types.ts";
import type { TrackerData, TrackerSnapshot } from "../data/trackerData.ts";
import { rankStyles, type RankStyle } from "../ui/rankStyle.ts";

const DataContext = createContext<TrackerData | null>(null);

export function TrackerDataProvider({ data, children }: { data: TrackerData; children: ReactNode }) {
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useTrackerData(): TrackerData {
  const data = useContext(DataContext);
  if (!data) throw new Error("useTrackerData must be used inside TrackerDataProvider");
  return data;
}

export function useSnapshot(): TrackerSnapshot {
  const data = useTrackerData();
  return useSyncExternalStore(data.subscribe, data.getSnapshot);
}

/** Screen input for one benchmark: runs grouped by its scenarios; confirmed aliases count too. */
export function screenInputFor(snapshot: TrackerSnapshot, scenarios: BenchmarkScenario[], rankColors: Record<string, string>): ScreenInput {
  const byScenario = new Map<string, TrackerSnapshot["records"]>();
  const resolved = new Map<string, string | null>();
  snapshot.records.forEach((record) => {
    if (!resolved.has(record.scenario)) resolved.set(record.scenario, resolveScenarioName(record.scenario, scenarios, snapshot.aliases));
    const name = resolved.get(record.scenario);
    if (!name) return;
    const list = byScenario.get(name);
    if (list) list.push(record);
    else byScenario.set(name, [record]);
  });
  return {
    scenarios,
    rankColors,
    recordsForScenario: (name: string) => byScenario.get(name) ?? [],
    exclusions: snapshot.exclusions,
    now: snapshot.now,
    settings: snapshot.settings,
  };
}

/** Inputs shared by every screen function, rebuilt only when the snapshot changes. */
export function useScreenInput(snapshot: TrackerSnapshot): ScreenInput {
  return useMemo(() => screenInputFor(snapshot, snapshot.benchmark.scenarios, snapshot.benchmark.rankColors), [snapshot]);
}

export function useRankStyles(snapshot: TrackerSnapshot): RankStyle[] {
  return useMemo(() => rankStyles(snapshot.benchmark.rankColors), [snapshot.benchmark.rankColors]);
}

export function useMapView(input: ScreenInput): MapView {
  return useMemo(() => mapScreen(input), [input]);
}

export interface TrackedSummary {
  /** Overall rank under the current rules; null until the thresholds are synced. */
  overall: RankView | null;
  styles: RankStyle[];
}

/** Overall rank of every followed benchmark, for the sidebar list. */
export function useTrackedSummaries(snapshot: TrackerSnapshot, activeOverall: RankView): Map<string, TrackedSummary> {
  return useMemo(() => {
    const summaries = new Map<string, TrackedSummary>();
    snapshot.tracked.forEach((entry) => {
      const styles = rankStyles(entry.rankColors);
      if (!entry.scenarios.length) {
        summaries.set(entry.id, { overall: null, styles });
        return;
      }
      // The active benchmark is already computed by the Map view; reuse it.
      const overall = entry.active ? activeOverall : mapScreen(screenInputFor(snapshot, entry.scenarios, entry.rankColors)).overall;
      summaries.set(entry.id, { overall, styles });
    });
    return summaries;
  }, [snapshot, activeOverall]);
}
