// Fetches the benchmark list from EVXL and rank thresholds from KovaaK, for the browser and the
// desktop data sources alike; each source saves the result its own way.
import type { Benchmark } from "../domain/types.ts";
import { mergeBenchmarks } from "../services/benchmark.ts";
import { fetchEvxlBenchmarks, fetchKovaakBenchmarkDetails } from "../services/benchmarkSync.ts";
import { LocalDevProxyUnavailableError } from "../services/browserFetch.ts";
import type { TrackedRef } from "./legacyState.ts";

const EVXL_BENCHMARK_URL = "https://evxl.app/benchmarks/Viscose%20Benchmarks%20S2";
/** Any Steam id works for reading thresholds; this is the one the classic app uses. */
const THRESHOLD_STEAM_ID = "76561197960287930";

export interface ThresholdSync {
  benchmarks: Benchmark[];
  /** Short status lines for the UI. */
  messages: string[];
}

/**
 * Updates the benchmark list, then the thresholds of every followed difficulty, so switching in
 * the sidebar works offline. `followed` gets the updated list (a new difficulty may appear).
 * Throws LocalDevProxyUnavailableError when the browser can't reach EVXL at all.
 */
export async function syncThresholds({
  benchmarks: current,
  followed,
  fetchImpl,
  now,
}: {
  benchmarks: Benchmark[];
  followed: (benchmarks: Benchmark[]) => TrackedRef[];
  fetchImpl: typeof fetch;
  now: () => Date;
}): Promise<ThresholdSync> {
  const messages: string[] = [];
  let benchmarks = current;
  try {
    const fetched = (await fetchEvxlBenchmarks(EVXL_BENCHMARK_URL, fetchImpl)).filter((item) => /viscose/i.test(item.benchmarkName));
    if (fetched.length) {
      benchmarks = mergeBenchmarks(benchmarks, fetched);
      messages.push(`已更新 ${fetched.length} 个 benchmark`);
    }
  } catch (error) {
    if (error instanceof LocalDevProxyUnavailableError) throw error;
    messages.push("EVXL 列表更新失败，沿用已有清单");
  }
  const synced: string[] = [];
  for (const ref of followed(benchmarks)) {
    const difficulty = benchmarks.find((item) => item.benchmarkName === ref.benchmark)?.difficulties?.find((item) => item.difficultyName === ref.difficulty);
    if (!difficulty?.kovaaksBenchmarkId) continue;
    try {
      const scenarios = await fetchKovaakBenchmarkDetails({ benchmarkId: difficulty.kovaaksBenchmarkId, steamId: THRESHOLD_STEAM_ID, fetchImpl });
      benchmarks = benchmarks.map((item) =>
        item.benchmarkName !== ref.benchmark
          ? item
          : {
              ...item,
              difficulties: (item.difficulties || []).map((entry) =>
                entry.difficultyName === ref.difficulty ? { ...entry, scenarios, apiUpdatedAt: now().toISOString() } : entry,
              ),
            },
      );
      synced.push(`${ref.difficulty} · ${scenarios.length} 个场景`);
    } catch {
      messages.push(`读取 ${ref.difficulty} 段位线失败，可稍后重试`);
    }
  }
  if (synced.length) messages.push(`段位线：${synced.join("，")}`);
  return { benchmarks, messages };
}
