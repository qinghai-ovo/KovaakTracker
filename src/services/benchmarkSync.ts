import { flattenBenchmarkApiData, type BenchmarkApiData } from "../core/benchmark.ts";
import type { Benchmark, BenchmarkScenario } from "../core/types.ts";

export async function fetchText(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export async function fetchJson<T = unknown>(url: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchEvxlBenchmarks(evxlBenchmarkUrl: string, fetchImpl: typeof fetch = fetch): Promise<Benchmark[]> {
  const html = await fetchText(evxlBenchmarkUrl, fetchImpl);
  const appMatch = html.match(/import\("\.\.\/(_app\/immutable\/entry\/app\.[^"]+\.js)"\)/);
  if (!appMatch) throw new Error("EVXL app bundle not found");
  const appText = await fetchText(`https://evxl.app/${appMatch[1]}`, fetchImpl);
  const nodeMatch = appText.match(/"\.\.\/nodes\/9\.[^"]+\.js"/);
  if (!nodeMatch) throw new Error("EVXL benchmark route not found");
  const nodeText = await fetchText(`https://evxl.app/_app/immutable/${nodeMatch[0].slice(4, -1)}`, fetchImpl);
  const chunkMatches = [...nodeText.matchAll(/from"\.\.\/chunks\/([^"]+\.js)"/g)].map((match) => match[1]);
  const candidates: string[] = [];
  for (const chunk of chunkMatches) {
    const text = await fetchText(`https://evxl.app/_app/immutable/chunks/${chunk}`, fetchImpl);
    if (text.includes('"benchmarkName"') && text.includes("Viscose")) candidates.push(text);
  }
  for (const text of candidates) {
    const jsonMatch = text.match(/JSON\.parse\(`([\s\S]+?)`\)/);
    if (!jsonMatch) continue;
    const parsed = JSON.parse(jsonMatch[1]) as Benchmark[];
    if (Array.isArray(parsed) && parsed.some((item) => item.benchmarkName === "Viscose Benchmarks S2")) {
      return parsed;
    }
  }
  throw new Error("EVXL benchmark data not found");
}

export async function fetchKovaakBenchmarkDetails({
  benchmarkId,
  steamId,
  fetchImpl = fetch,
}: {
  benchmarkId: string | number;
  steamId: string;
  fetchImpl?: typeof fetch;
}): Promise<BenchmarkScenario[]> {
  const url = `https://kovaaks.com/webapp-backend/benchmarks/player-progress-rank-benchmark?benchmarkId=${benchmarkId}&steamId=${steamId}`;
  const data = await fetchJson<BenchmarkApiData>(url, fetchImpl);
  return flattenBenchmarkApiData(data);
}
