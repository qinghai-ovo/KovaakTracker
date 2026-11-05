// Sample data from the v2 design canvas (Today / Map screens), turned into real records.
import type { BenchmarkScenario, ScoreRecord } from "../../domain/types.ts";

export const rankColors: Record<string, string> = {
  Lemming: "#C5C3F2",
  Hare: "#B2CBEA",
  Ermine: "#BAF6FC",
  Puffin: "#7BCAF0",
  Penguin: "#6B94DF",
  Fox: "#5558AA",
  Mammoth: "#6E3F98",
  Orca: "#C080E4",
  Seal: "#F5BDE8",
};

/** Design sample thresholds: round(base * (1 + 0.12 i) / 10) * 10. */
export function sampleThresholds(base: number): number[] {
  return Array.from({ length: 9 }, (_, i) => Math.round((base * (1 + 0.12 * i)) / 10) * 10);
}

/** "Now" in the design: Tuesday 2026-11-03, 21:00 local time. */
export const NOW = new Date(2026, 10, 3, 21, 0, 0);

function localIso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function run(scenario: string, score: number, date: Date): ScoreRecord {
  const iso = localIso(date);
  return { id: `${scenario}|${iso}|${score}`, scenario, score, date: iso, source: "csv" };
}

// ---- Today screen -------------------------------------------------------

export const todayPlan = [
  { name: "Smoothbot Arm", category: "Control Tracking", sub: "Arm", base: 2000, target: 4, hist: [2580, 2620, 2550, 2700, 2660, 2610, 2690, 2720, 2640, 2700], today: [2610, 2702, 980, 2740] },
  { name: "Wrist Strafe", category: "Control Tracking", sub: "Wrist", base: 1500, target: 3, hist: [1820, 1870, 1850, 1900, 1880, 1910, 1860, 1930, 1890, 1905], today: [1880, 1955] },
  { name: "Speed Switch", category: "Flick Tech", sub: "Speed", base: 1100, target: 3, hist: [1360, 1380, 1340, 1400, 1390, 1370, 1410, 1385, 1395, 1402], today: [1390, 1420, 1415] },
  { name: "Pasu Reading", category: "Click Timing", sub: "Reading", base: 700, target: 3, hist: [840, 860, 850, 870, 855, 865, 880, 845, 862, 858], today: [870] },
  { name: "Micro Flick", category: "Flick Tech", sub: "Micro", base: 900, target: 3, hist: [960, 975, 950, 990, 980, 970, 985, 965, 978, 982], today: [] as number[] },
  { name: "Controlsphere", category: "Reactive Tracking", sub: "Control", base: 2400, target: 3, hist: [2900, 2950, 2880, 2990, 2930, 2960, 2910, 2970, 2940, 2955], today: [] as number[] },
];

export function todayFixture() {
  const scenarios: BenchmarkScenario[] = todayPlan.map((item) => ({
    name: item.name,
    category: item.category,
    subcategory: item.sub,
    rankMaxes: sampleThresholds(item.base),
  }));
  const records: ScoreRecord[] = [];
  todayPlan.forEach((item) => {
    // History: one run per day over the previous 10 days, at 20:00.
    item.hist.forEach((score, i) => records.push(run(item.name, score, new Date(2026, 10, 3 - (item.hist.length - i), 20, 0))));
  });
  // Today's runs in the order the design's live feed shows them, two minutes apart from 19:31.
  let minute = 19 * 60 + 31;
  todayPlan.forEach((item) => {
    item.today.forEach((score) => {
      records.push(run(item.name, score, new Date(2026, 10, 3, Math.floor(minute / 60), minute % 60)));
      minute += 2;
    });
  });
  return { scenarios, records, plan: todayPlan.map((item) => ({ scenarioName: item.name, targetRuns: item.target })) };
}

// ---- Map screen ---------------------------------------------------------

/** [category, subcategory, scenario, base, personal best, this-week avg, last-week avg, runs this week] */
export const mapRows: Array<[string, string, string, number, number, number, number, number]> = [
  ["Control Tracking", "Arm", "Smoothbot Arm", 2000, 2740, 2700, 2650, 9],
  ["Control Tracking", "Arm", "Air Angelic", 1600, 2090, 2010, 2050, 4],
  ["Control Tracking", "Wrist", "Wrist Strafe", 1500, 1955, 1905, 1840, 7],
  ["Control Tracking", "Fingertip", "Tiny Track", 800, 940, 905, 900, 0],
  ["Control Tracking", "Blending", "Blend Sphere", 1200, 1610, 1560, 1500, 5],
  ["Reactive Tracking", "Control", "Controlsphere", 2400, 2990, 2950, 2990, 3],
  ["Reactive Tracking", "Speed", "Speed Track", 1800, 2180, 2120, 2010, 6],
  ["Reactive Tracking", "Reading", "Reading Track", 1300, 1480, 1420, 1440, 2],
  ["Flick Tech", "Speed", "Speed Switch", 1100, 1420, 1400, 1330, 12],
  ["Flick Tech", "Stability", "Static Flick", 950, 1230, 1180, 1170, 4],
  ["Flick Tech", "Micro", "Micro Flick", 900, 990, 965, 978, 1],
  ["Flick Tech", "Post-Flick", "Post Flick", 1000, 1330, 1290, 1200, 8],
  ["Click Timing", "Reading", "Pasu Reading", 700, 880, 860, 850, 5],
  ["Click Timing", "Stability", "Bounce Click", 750, 900, 820, 880, 2],
  ["Click Timing", "Precision", "Precise Pop", 600, 720, 690, 700, 0],
  ["Click Timing", "Precision", "Tile Frenzy", 650, 870, 840, 790, 6],
];

/**
 * Records that reproduce each row: the PB three weeks ago, three runs at last week's average
 * (Wednesday 2026-10-28) and `runs` runs at this week's average (Monday 2026-11-02).
 */
export function mapFixture() {
  const scenarios: BenchmarkScenario[] = mapRows.map(([category, subcategory, name, base]) => ({
    name,
    category,
    subcategory,
    rankMaxes: sampleThresholds(base),
  }));
  const records: ScoreRecord[] = [];
  mapRows.forEach(([, , name, , pb, avg, prev, runs]) => {
    records.push(run(name, pb, new Date(2026, 9, 14, 20, 0)));
    for (let i = 0; i < 3; i += 1) records.push(run(name, prev, new Date(2026, 9, 28, 20, i)));
    for (let i = 0; i < runs; i += 1) records.push(run(name, avg, new Date(2026, 10, 2, 20, i)));
  });
  return { scenarios, records };
}

export function recordsLookup(records: ScoreRecord[]) {
  return (scenarioName: string) => records.filter((record) => record.scenario === scenarioName);
}

// ---- Whole demo library -------------------------------------------------

/**
 * One consistent library for the demo app: all 16 Map scenarios, where the six Today plan
 * scenarios use their run-by-run history and the rest use the Map weekly summary.
 */
export function demoDataset() {
  const map = mapFixture();
  const today = todayFixture();
  const planNames = new Set(today.plan.map((item) => item.scenarioName));
  return {
    scenarios: map.scenarios,
    records: [...map.records.filter((record) => !planNames.has(record.scenario)), ...today.records],
    plan: today.plan,
  };
}

// ---- Extra demo material for the Data and Journal screens ----------------

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Older practice sessions (Jul 20 – Oct 11) so the 16-week heatmap has history. Scores stay
 * below last week's average, so personal bests and the recent weekly numbers are unchanged.
 */
export function backgroundSessions(): ScoreRecord[] {
  const random = seeded(20260720);
  const records: ScoreRecord[] = [];
  for (let day = 0; day < 84; day += 1) {
    if (random() > 0.6) continue;
    const date = new Date(2026, 6, 20 + day, 19, Math.floor(random() * 40));
    const scenarioCount = 1 + Math.floor(random() * 3);
    for (let s = 0; s < scenarioCount; s += 1) {
      const [, , name, , , , prev] = mapRows[Math.floor(random() * mapRows.length)];
      const runs = 2 + Math.floor(random() * 3);
      for (let r = 0; r < runs; r += 1) {
        date.setMinutes(date.getMinutes() + 2);
        records.push(run(name, Math.round(prev * (0.88 + random() * 0.08)), new Date(date)));
      }
    }
  }
  return records;
}

/** Runs whose scenario names are not in the benchmark (for "未匹配的场景"). */
export function unmatchedRecords(): ScoreRecord[] {
  const groups: Array<[string, number, number]> = [
    ["VT Smoothbot Arm Easy", 6, 2400],
    ["1wall6targets TE", 5, 1100],
    ["Pasu Angelic", 4, 760],
    ["Tile Frenzy 180", 3, 900],
  ];
  return groups.flatMap(([name, count, score], g) =>
    Array.from({ length: count }, (_, i) => run(name, score + i * 7, new Date(2026, 9, 20 + g, 20, i * 2))),
  );
}

export const MANUAL_RECORD: ScoreRecord = {
  id: "manual-1",
  scenario: "Air Angelic",
  score: 2050,
  date: "2026-11-02T21:10:00",
  note: "在朋友电脑上打的",
  source: "manual",
};

/** A run the user ignored by hand (Controlsphere, 11-02 20:56). */
export const IGNORED_RECORD: ScoreRecord = run("Controlsphere", 2140, new Date(2026, 10, 2, 20, 56));

export const failedImports = [
  { fileName: "Smoothbot Arm - Challenge - 2026.10.28-21.04.11 Stats.csv", reason: "文件为空" },
  { fileName: "Static Flick - Challenge - 2026.10.21-19.40.02 Stats.csv", reason: "找不到分数" },
  { fileName: "Wrist Strafe - Challenge - 2026.10.14-20.12.55 Stats.csv", reason: "读取失败" },
];

/** Threshold multipliers for the demo difficulties. */
export const difficultyScale: Record<string, number> = { Easier: 1, Medium: 1.2, Hard: 1.4 };
