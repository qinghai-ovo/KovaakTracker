import { shiftDayKey, trainingDayKey, trainingWeekRange } from "../day.ts";
import { average } from "../stats.ts";
import { resolveSettings, scenarioSnapshot, type ScreenInput } from "./shared.ts";

/** Training time of one session: first to last run plus roughly one run's length. */
export function trainingMinutes(dates: string[]): number {
  if (!dates.length) return 0;
  const times = dates.map((date) => new Date(date).getTime());
  return Math.round((Math.max(...times) - Math.min(...times)) / 60000) + 2;
}

export interface JournalRun {
  score: number;
  date: string;
  counts: boolean;
  suspicious: boolean;
  /** Best counted run of this block. */
  isBlockBest: boolean;
}

/** Consecutive runs of one scenario within a day. */
export interface JournalBlock {
  start: string;
  scenarioName: string;
  category: string;
  rankIndex: number;
  runs: JournalRun[];
  countedRuns: number;
  average: number | null;
  /** Gain over the best counted score before this block, when the block set a new PB. */
  personalBestGain: number | null;
  ignoredRuns: number;
  suspiciousIgnored: number;
}

export interface HeatCell {
  dayKey: string;
  /** null for days after `now`. */
  minutes: number | null;
}

export interface JournalView {
  selectedDay: string;
  today: string;
  /** Oldest week first; each week Monday..Sunday. */
  weeks: HeatCell[][];
  streak: number;
  trainedLast30: number;
  /** Every day with at least one run, oldest first. */
  trainingDays: string[];
  blocks: JournalBlock[];
  totals: {
    minutes: number;
    /** Minutes minus the previous training day's; null when there is none. */
    minutesDelta: number | null;
    countedRuns: number;
    ignoredRuns: number;
    scenarios: number;
    newPersonalBests: string[];
  };
  firstRunAt: string | null;
  lastRunAt: string | null;
}

export interface JournalInput extends ScreenInput {
  /** Training day to show; defaults to today. */
  dayKey?: string | null;
  weeks?: number;
}

export function journalScreen(input: JournalInput): JournalView {
  const settings = resolveSettings(input.settings);
  const dayOf = (date: string) => trainingDayKey(date, settings.dayStartHour);
  const today = trainingDayKey(input.now, settings.dayStartHour);
  const selectedDay = input.dayKey ?? today;

  const snapshots = input.scenarios.map((scenario) => scenarioSnapshot(scenario, input, settings));
  const allRuns = snapshots.flatMap((snapshot) => snapshot.runs.map((run) => ({ run, snapshot })));

  const datesByDay = new Map<string, string[]>();
  allRuns.forEach(({ run }) => {
    const key = dayOf(run.record.date);
    datesByDay.set(key, [...(datesByDay.get(key) || []), run.record.date]);
  });
  const minutesOn = (dayKey: string) => trainingMinutes(datesByDay.get(dayKey) || []);
  const trainingDays = [...datesByDay.keys()].sort();

  // Heatmap: the current week and the weeks before it.
  const weekCount = input.weeks ?? 16;
  const firstMonday = shiftDayKey(trainingWeekRange(input.now, settings.dayStartHour).start, -7 * (weekCount - 1));
  const weeks: HeatCell[][] = Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const dayKey = shiftDayKey(firstMonday, week * 7 + day);
      return { dayKey, minutes: dayKey > today ? null : minutesOn(dayKey) };
    }),
  );

  let streak = 0;
  for (let day = selectedDay; datesByDay.has(day); day = shiftDayKey(day, -1)) streak += 1;
  let trainedLast30 = 0;
  for (let offset = 0; offset < 30; offset += 1) if (datesByDay.has(shiftDayKey(today, -offset))) trainedLast30 += 1;

  // Timeline blocks for the selected day.
  const dayRuns = allRuns.filter(({ run }) => dayOf(run.record.date) === selectedDay).sort((a, b) => new Date(a.run.record.date).getTime() - new Date(b.run.record.date).getTime());
  const blocks: JournalBlock[] = [];
  dayRuns.forEach(({ run, snapshot }) => {
    const last = blocks[blocks.length - 1];
    const block =
      last && last.scenarioName === snapshot.scenario.name
        ? last
        : (() => {
            const created: JournalBlock = {
              start: run.record.date,
              scenarioName: snapshot.scenario.name,
              category: snapshot.scenario.category || "",
              rankIndex: snapshot.rank.index,
              runs: [],
              countedRuns: 0,
              average: null,
              personalBestGain: null,
              ignoredRuns: 0,
              suspiciousIgnored: 0,
            };
            blocks.push(created);
            return created;
          })();
    block.runs.push({ score: run.record.score, date: run.record.date, counts: run.counts, suspicious: run.suspicious, isBlockBest: false });
  });
  blocks.forEach((block) => {
    const snapshot = snapshots.find((item) => item.scenario.name === block.scenarioName)!;
    const counted = block.runs.filter((run) => run.counts).map((run) => run.score);
    const best = counted.length ? Math.max(...counted) : null;
    block.runs.forEach((run) => {
      run.isBlockBest = run.counts && run.score === best;
    });
    block.countedRuns = counted.length;
    block.average = average(counted);
    block.ignoredRuns = block.runs.length - counted.length;
    block.suspiciousIgnored = block.runs.filter((run) => run.suspicious && !run.counts).length;
    const before = snapshot.counted.filter((record) => new Date(record.date).getTime() < new Date(block.start).getTime()).map((record) => record.score);
    const previousBest = before.length ? Math.max(...before) : null;
    block.personalBestGain = best !== null && previousBest !== null && best > previousBest ? best - previousBest : null;
  });

  const previousDay = [...trainingDays].reverse().find((day) => day < selectedDay) ?? null;
  const minutes = minutesOn(selectedDay);
  const dates = dayRuns.map(({ run }) => run.record.date);

  return {
    selectedDay,
    today,
    weeks,
    streak,
    trainedLast30,
    trainingDays,
    blocks,
    totals: {
      minutes,
      minutesDelta: previousDay ? minutes - minutesOn(previousDay) : null,
      countedRuns: blocks.reduce((sum, block) => sum + block.countedRuns, 0),
      ignoredRuns: blocks.reduce((sum, block) => sum + block.ignoredRuns, 0),
      scenarios: new Set(blocks.map((block) => block.scenarioName)).size,
      newPersonalBests: [...new Set(blocks.filter((block) => block.personalBestGain !== null).map((block) => block.scenarioName))],
    },
    firstRunAt: dates[0] ?? null,
    lastRunAt: dates[dates.length - 1] ?? null,
  };
}
