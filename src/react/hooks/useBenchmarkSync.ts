import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { mergeBenchmarks } from "../../core/benchmark.ts";
import type { AppState, Benchmark, BenchmarkDifficulty } from "../../core/types.ts";
import { fetchEvxlBenchmarks, fetchKovaakBenchmarkDetails } from "../../services/benchmarkSync.ts";
import { browserFetch, LocalDevProxyUnavailableError } from "../../services/browserFetch.ts";
import { benchmarkFallback } from "../../data/benchmarkFallback.ts";

const DUMMY_STEAM_ID = "76561197960287930";
const EVXL_BENCHMARK_URL = "https://evxl.app/benchmarks/Viscose%20Benchmarks%20S2";

export function useBenchmarkSync({
  currentDifficulty,
  selectedBenchmark,
  selectedDifficulty,
  setState,
  setSyncStatus,
  stateBenchmarks,
}: {
  currentDifficulty: BenchmarkDifficulty | undefined;
  selectedBenchmark: string;
  selectedDifficulty: string;
  setState: Dispatch<SetStateAction<AppState>>;
  setSyncStatus: Dispatch<SetStateAction<string>>;
  stateBenchmarks: Benchmark[];
}) {
  const detailRequestId = useRef(0);

  const syncFromEvxl = useCallback(async (options: { silent?: boolean } = {}): Promise<Benchmark[] | null> => {
    if (!options.silent) setSyncStatus("正在从 EVXL 同步...");
    try {
      const benchmarks = await fetchEvxlBenchmarks(EVXL_BENCHMARK_URL, browserFetch);
      const filtered = benchmarks.filter((benchmark) => /viscose/i.test(benchmark.benchmarkName));
      if (!filtered.length) throw new Error("No Viscose benchmarks found");
      const nextBenchmarks = mergeBenchmarks(stateBenchmarks.length ? stateBenchmarks : benchmarkFallback, filtered);
      setState((current) => ({
        ...current,
        benchmarks: mergeBenchmarks(current.benchmarks.length ? current.benchmarks : benchmarkFallback, filtered),
      }));
      setSyncStatus(`已同步 ${filtered.length} 个 Viscose benchmark`);
      return nextBenchmarks;
    } catch (error) {
      if (error instanceof LocalDevProxyUnavailableError) {
        setSyncStatus("在线同步需要通过 start-dev.bat 打开 http://127.0.0.1:5173/react.html");
      } else if (!options.silent) {
        setSyncStatus("EVXL 在线同步失败，继续使用内置清单");
      }
      return null;
    }
  }, [setState, setSyncStatus, stateBenchmarks]);

  const ensureBenchmarkDetails = useCallback(
    async (force = false, benchmarkSource: Benchmark[] = stateBenchmarks) => {
      const difficulty = findDifficulty(benchmarkSource, selectedBenchmark, selectedDifficulty) || currentDifficulty;
      if (!difficulty?.kovaaksBenchmarkId) return;
      if (!force && difficulty.scenarios?.length) return;
      const requestId = (detailRequestId.current += 1);
      const difficultyName = difficulty.difficultyName;
      setSyncStatus(`正在读取 ${difficultyName} 场景和段位线...`);
      try {
        const nextScenarios = await fetchKovaakBenchmarkDetails({
          benchmarkId: difficulty.kovaaksBenchmarkId,
          steamId: DUMMY_STEAM_ID,
          fetchImpl: browserFetch,
        });
        if (requestId !== detailRequestId.current) return;
        setState((current) => ({
          ...current,
          benchmarks: current.benchmarks.map((benchmark) =>
            benchmark.benchmarkName !== selectedBenchmark
              ? benchmark
              : {
                  ...benchmark,
                  difficulties: (benchmark.difficulties || []).map((item) =>
                    item.difficultyName === difficultyName
                      ? { ...item, scenarios: nextScenarios, apiUpdatedAt: new Date().toISOString() }
                      : item,
                  ),
                },
          ),
        }));
        setSyncStatus(`已读取 ${difficultyName} · ${nextScenarios.length} 个场景`);
      } catch (error) {
        if (requestId !== detailRequestId.current) return;
        if (error instanceof LocalDevProxyUnavailableError) {
          setSyncStatus("在线阈值更新需要通过 start-dev.bat 打开 http://127.0.0.1:5173/react.html");
        } else {
          setSyncStatus(difficulty.scenarios?.length ? `在线阈值更新失败，继续使用已缓存 ${difficulty.scenarios.length} 个场景` : "读取 KovaaK 阈值失败，可稍后重试");
        }
      }
    },
    [currentDifficulty, selectedBenchmark, selectedDifficulty, setState, setSyncStatus, stateBenchmarks],
  );

  return {
    ensureBenchmarkDetails,
    syncFromEvxl,
  };
}

function findDifficulty(benchmarks: Benchmark[], benchmarkName: string, difficultyName: string) {
  return benchmarks
    .find((benchmark) => benchmark.benchmarkName === benchmarkName)
    ?.difficulties?.find((difficulty) => difficulty.difficultyName === difficultyName);
}
