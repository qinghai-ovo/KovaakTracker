import { toggleRecordCounted } from "../domain/exclusions.ts";
import { sameScenario } from "../domain/scenario.ts";
import type { AppState, ScoreRecord } from "../domain/types.ts";
import { loadState, type StorageLike } from "../services/storage.ts";
import { benchmarkFallback } from "./benchmarkFallback.ts";
import { APP_STORAGE_KEY, LEGACY_STORAGE_KEY, parseAppStore, snapshotFromLegacy, withDayNote, type AppStore } from "./legacyState.ts";
import type { ManualRunInput, TrackerData, TrackerEvent, TrackerSnapshot } from "./trackerData.ts";

type RawState = Partial<AppState> & Record<string, unknown>;

interface BrowserDataOptions {
  storage?: StorageLike;
  clock?: () => Date;
  /** Listen for changes made in other tabs (e.g. an import in the classic app). Off in tests. */
  watch?: boolean;
}

/**
 * Real data in this browser: reads what the classic app (react.html) imported and saved, and
 * writes edits back to the same storage so both UIs stay in sync. Both pages must be opened
 * from the same address (127.0.0.1 and localhost keep separate storage).
 */
export function createBrowserData({ storage = localStorage, clock = () => new Date(), watch = true }: BrowserDataOptions = {}): TrackerData {
  let legacy: AppState = loadState(LEGACY_STORAGE_KEY, benchmarkFallback, storage);
  let store: AppStore = parseAppStore(storage.getItem(APP_STORAGE_KEY));
  let snapshot: TrackerSnapshot = snapshotFromLegacy(legacy, store, clock());
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: TrackerEvent) => void>();

  function rebuild() {
    snapshot = snapshotFromLegacy(legacy, store, clock());
    listeners.forEach((listener) => listener());
  }

  function readRaw(): RawState {
    try {
      const parsed = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? (parsed as RawState) : {};
    } catch {
      return {};
    }
  }

  /** Changes only the given fields of the classic app's saved state, keeping everything else. */
  function writeLegacy(patch: (raw: RawState, current: AppState) => void) {
    const raw = readRaw();
    patch(raw, legacy);
    try {
      storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(raw));
    } catch {
      // Storage full: keep the edit in memory for this session.
    }
    legacy = loadState(LEGACY_STORAGE_KEY, benchmarkFallback, storage);
    rebuild();
  }

  function writeStore(next: Partial<AppStore>) {
    store = { ...store, ...next };
    try {
      storage.setItem(APP_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Same as above.
    }
    rebuild();
  }

  function reloadFromStorage() {
    const before = new Set(legacy.csvRecords.map((record) => record.id));
    legacy = loadState(LEGACY_STORAGE_KEY, benchmarkFallback, storage);
    store = parseAppStore(storage.getItem(APP_STORAGE_KEY));
    rebuild();
    const added = legacy.csvRecords.filter((record) => !before.has(record.id));
    if (added.length) eventListeners.forEach((listener) => listener({ type: "runs:added", records: added }));
  }

  if (watch && typeof window !== "undefined") {
    // Another tab (usually the classic app after an import) changed the saved data.
    window.addEventListener("storage", (event) => {
      if (event.key === LEGACY_STORAGE_KEY || event.key === APP_STORAGE_KEY) reloadFromStorage();
    });
    // Keep "today" correct when the page stays open past midnight / the day start hour.
    window.setInterval(() => {
      if (clock().getMinutes() !== snapshot.now.getMinutes()) rebuild();
    }, 30_000);
  }

  const manualRecord = (id: string, input: ManualRunInput): ScoreRecord => ({
    id,
    scenario: input.scenario,
    score: input.score,
    date: new Date(input.date).toISOString(),
    note: input.note,
    source: "manual",
  });

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
      writeLegacy((raw, current) => {
        raw.recordExclusions = toggleRecordCounted(record, current.recordExclusions, currentlyCounts);
      });
    },
    addManualRun(input) {
      writeLegacy((raw, current) => {
        raw.manualRecords = [...current.manualRecords, manualRecord(`manual-${Date.now()}`, input)];
      });
    },
    updateManualRun(id, input) {
      writeLegacy((raw, current) => {
        raw.manualRecords = current.manualRecords.map((record) => (record.id === id ? manualRecord(id, input) : record));
      });
    },
    deleteManualRun(id) {
      writeLegacy((raw, current) => {
        raw.manualRecords = current.manualRecords.filter((record) => record.id !== id);
      });
    },
    confirmAlias(rawName, scenarioName) {
      writeStore({ aliases: { ...store.aliases, [rawName]: scenarioName } });
    },
    addToPlan(scenarioName, targetRuns = 3) {
      if (store.plan.some((item) => sameScenario(item.scenarioName, scenarioName))) return;
      writeStore({ plan: [...store.plan, { scenarioName, targetRuns }] });
    },
    updateSettings(patch) {
      writeStore({ settings: { ...store.settings, ...patch } });
    },
    updatePreferences(patch) {
      writeStore({ preferences: { ...store.preferences, ...patch } });
    },
    updateSetup(patch) {
      writeLegacy((raw, current) => {
        raw.defaultSetupProfile = { ...current.defaultSetupProfile, ...patch };
      });
    },
    setDifficulty(difficulty) {
      writeLegacy((raw) => {
        raw.selectedDifficulty = difficulty;
      });
    },
    updateDay(dayKey, patch) {
      if (patch.note !== undefined) {
        const note = patch.note;
        writeLegacy((raw, current) => {
          raw.dailyReviews = withDayNote(current.dailyReviews, dayKey, note);
        });
      }
      if (patch.mood) {
        const mood = { ...store.moods[dayKey], ...patch.mood };
        writeStore({ moods: { ...store.moods, [dayKey]: mood } });
      }
    },
  };
}

/** True when the classic app has saved any runs in this browser. */
export function hasBrowserData(storage: StorageLike = localStorage): boolean {
  const state = loadState(LEGACY_STORAGE_KEY, benchmarkFallback, storage);
  return state.csvRecords.length + state.manualRecords.length > 0;
}
