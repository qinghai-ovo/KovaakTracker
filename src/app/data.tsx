import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { mapScreen, type MapView } from "../domain/screens/map.ts";
import type { ScreenInput } from "../domain/screens/shared.ts";
import { resolveScenarioName } from "../domain/screens/data.ts";
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

/** Inputs shared by every screen function, rebuilt only when the snapshot changes. */
export function useScreenInput(snapshot: TrackerSnapshot): ScreenInput {
  return useMemo(() => {
    // Group runs by benchmark scenario once; confirmed aliases count toward their scenario.
    const byScenario = new Map<string, TrackerSnapshot["records"]>();
    const resolved = new Map<string, string | null>();
    snapshot.records.forEach((record) => {
      if (!resolved.has(record.scenario)) resolved.set(record.scenario, resolveScenarioName(record.scenario, snapshot.benchmark.scenarios, snapshot.aliases));
      const name = resolved.get(record.scenario);
      if (!name) return;
      const list = byScenario.get(name);
      if (list) list.push(record);
      else byScenario.set(name, [record]);
    });
    return {
      scenarios: snapshot.benchmark.scenarios,
      rankColors: snapshot.benchmark.rankColors,
      recordsForScenario: (name: string) => byScenario.get(name) ?? [],
      exclusions: snapshot.exclusions,
      now: snapshot.now,
      settings: snapshot.settings,
    };
  }, [snapshot]);
}

export function useRankStyles(snapshot: TrackerSnapshot): RankStyle[] {
  return useMemo(() => rankStyles(snapshot.benchmark.rankColors), [snapshot.benchmark.rankColors]);
}

export function useMapView(input: ScreenInput): MapView {
  return useMemo(() => mapScreen(input), [input]);
}
