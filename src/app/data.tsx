import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { mapScreen, type MapView } from "../domain/screens/map.ts";
import type { ScreenInput } from "../domain/screens/shared.ts";
import { sameScenario } from "../domain/scenario.ts";
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
    const byScenario = new Map<string, TrackerSnapshot["records"]>();
    snapshot.benchmark.scenarios.forEach((scenario) => {
      byScenario.set(
        scenario.name,
        snapshot.records.filter((record) => sameScenario(record.scenario, scenario.name)),
      );
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
