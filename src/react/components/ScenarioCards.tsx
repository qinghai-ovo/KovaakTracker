import { recordsForScenario } from "../../core/records.ts";
import { rankForScore } from "../../core/rank.ts";
import { average } from "../../core/stats.ts";
import type { BenchmarkDifficulty, BenchmarkScenario, RecordIndex } from "../../core/types.ts";
import { formatNumber } from "../format.ts";

interface ScenarioCardsProps {
  currentDifficulty: BenchmarkDifficulty | undefined;
  recordIndex: RecordIndex;
  scenarios: BenchmarkScenario[];
  onSelectScenario: (scenarioName: string) => void;
}

export function ScenarioCards({ currentDifficulty, onSelectScenario, recordIndex, scenarios }: ScenarioCardsProps) {
  const rankColors = currentDifficulty?.rankColors || {};

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Benchmark 场景</h2>
        <span>{scenarios.length} 个</span>
      </div>
      <div className="scenario-cards">
        {scenarios.length ? (
          scenarios.map((scenario) => {
            const records = recordsForScenario(recordIndex, scenario.name);
            const avg10 = average(records.slice(0, 10).map((record) => record.score));
            const best = records.length ? Math.max(...records.map((record) => record.score)) : null;
            const rank = rankForScore(avg10, scenario.rankMaxes || [], rankColors);
            return (
              <article className="scenario-card" key={scenario.name}>
                <div>
                  <strong>{scenario.name}</strong>
                  <small>
                    {scenario.category || "-"} / {scenario.subcategory || "-"} · 10 次均分 {formatNumber(avg10)} · 最高 {formatNumber(best)} · {rank?.name || "未定级"}
                  </small>
                </div>
                <button className="ghost-button" type="button" onClick={() => onSelectScenario(scenario.name)}>
                  查看
                </button>
              </article>
            );
          })
        ) : (
          <div className="empty-state">
            <strong>暂无 benchmark 场景</strong>
            <span>同步或刷新场景后会显示列表。</span>
          </div>
        )}
      </div>
    </section>
  );
}
