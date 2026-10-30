export type RecordSource = "csv" | "manual";

export interface ScoreRecord {
  id?: string;
  scenario: string;
  rawScenario?: string;
  score: number;
  date: string;
  note?: string;
  source?: RecordSource;
  metadata?: CsvMetadata;
}

export interface CsvMetadata {
  sourceFile: string;
  sourceType: RecordSource;
  sensitivity?: number;
  fov?: number;
  dpi?: number;
  rawMetadata?: Record<string, string>;
}

export interface RecordExclusion {
  recordKey: string;
  status: "excluded" | "suspicious";
  reason: "zero-score" | "low-vs-median" | "manual";
  note?: string;
  updatedAt: string;
}

export interface SetupProfile {
  mouse: string;
  mousepad: string;
  sensitivity: string;
  dpi: string;
  fov: string;
  notes: string;
}

export interface DailyReviewEntry {
  dateKey: string;
  note: string;
  state?: DailyReviewState;
  trainingTimeOverride?: { start: string; end: string };
  setupOverride?: Partial<SetupProfile>;
}

export interface DailyReviewState {
  caffeine: string;
  fatigue: string;
  sleep: string;
  warmup: string;
}

export interface BenchmarkScenario {
  name: string;
  category?: string;
  subcategory?: string;
  leaderboardId?: string | number;
  rankMaxes?: number[];
}

export interface BenchmarkDifficulty {
  difficultyName: string;
  sharecode?: string;
  kovaaksBenchmarkId?: string | number;
  rankColors?: Record<string, string>;
  scenarios?: BenchmarkScenario[];
  apiUpdatedAt?: string;
}

export interface Benchmark {
  benchmarkName: string;
  difficulties?: BenchmarkDifficulty[];
}

export type DailyReviewDensity = "ultra" | "compact" | "normal" | "wide";
export type DailyReviewProgressStyle = "simple" | "normal";

export interface DailyReviewTableSettings {
  density: DailyReviewDensity;
  progressStyle: DailyReviewProgressStyle;
  skew: number;
  outerRadius: number;
  innerRadius: number;
  textSize: number;
  textContrast: number;
  boldText: boolean;
  textShadow: boolean;
  showProgressPercent: boolean;
  shadeCategoryCells: boolean;
  shadeRankCells: boolean;
  highContrast: boolean;
  useRankColumnColors: boolean;
  simplifyScenarioNames: boolean;
}

export interface AppState {
  benchmarks: Benchmark[];
  manualRecords: ScoreRecord[];
  csvRecords: ScoreRecord[];
  selectedBenchmark: string;
  selectedDifficulty: string;
  selectedScenario: string;
  dailyReviewDate: string;
  dailyReviewMetric: string;
  dailyReviewScope: string;
  dailyReviewTableSettings: DailyReviewTableSettings;
  recordExclusions: Record<string, RecordExclusion>;
  dailyReviews: Record<string, DailyReviewEntry>;
  defaultSetupProfile: SetupProfile;
  lastBenchmarkSyncDate: string;
  statsFolderName: string;
  statsFolderUpdatedAt: string;
}

export interface CsvImportStatus {
  fileName: string;
  success: boolean;
  failureReason: "" | "empty" | "missing-scenario" | "missing-score" | "read-error";
  dateSource: "" | "filename" | "csv" | "fallback";
  matchedCurrentBenchmark: boolean;
}

export interface CsvParseResult {
  record: ScoreRecord | null;
  status: CsvImportStatus;
}

export interface RecordIndex {
  all: ScoreRecord[];
  matched: ScoreRecord[];
  byScenario: Map<string, ScoreRecord[]>;
}

export interface DailySession {
  dateKey: string;
  count: number;
  avg: number | null;
  best: number | null;
  worst: number | null;
  median: number | null;
}

export interface RankResult {
  name: string;
  next: { name: string; need: number } | null;
  color: string;
}
