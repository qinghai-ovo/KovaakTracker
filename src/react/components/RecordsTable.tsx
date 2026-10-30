import { recordKey } from "../../core/exclusions.ts";
import type { RecordExclusion, ScoreRecord } from "../../core/types.ts";
import { formatDate, formatNumber } from "../format.ts";

interface RecordsTableProps {
  records: ScoreRecord[];
  onEditManualRecord: (record: ScoreRecord) => void;
  onExcludeRecord: (record: ScoreRecord) => void;
  onRemoveManualRecord: (id: string) => void;
  onRestoreRecord: (record: ScoreRecord) => void;
  recordExclusions: Record<string, RecordExclusion>;
}

export function RecordsTable({ onEditManualRecord, onExcludeRecord, onRemoveManualRecord, onRestoreRecord, recordExclusions, records }: RecordsTableProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>最近记录</h2>
        <span>{records.length} 条</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>场景</th>
              <th>分数</th>
              <th>来源</th>
              <th>状态</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {records.length ? (
              records.map((record) => {
                const isManual = record.source === "manual";
                const exclusion = recordExclusions[recordKey(record)];
                return (
                  <tr className={exclusion?.status === "excluded" ? "is-excluded-record" : exclusion?.status === "suspicious" ? "is-suspicious-record" : ""} key={recordKey(record)}>
                    <td>{formatDate(record.date)}</td>
                    <td>{record.scenario}</td>
                    <td>
                      <strong>{formatNumber(record.score)}</strong>
                    </td>
                    <td>{isManual ? "手动" : "CSV"}</td>
                    <td>
                      <span className="record-status">{exclusionLabel(exclusion)}</span>
                    </td>
                    <td>{record.note || record.metadata?.sourceFile || ""}</td>
                    <td>
                      <div className="record-actions">
                        {exclusion?.status === "excluded" ? (
                          <button className="icon-button" type="button" title="恢复" onClick={() => onRestoreRecord(record)}>
                            恢
                          </button>
                        ) : (
                          <button className="icon-button" type="button" title="排除" onClick={() => onExcludeRecord(record)}>
                            排
                          </button>
                        )}
                        {isManual ? (
                          <>
                            <button className="icon-button" type="button" title="编辑" onClick={() => onEditManualRecord(record)}>
                              改
                            </button>
                            <button className="icon-button" type="button" title="删除" onClick={() => record.id && onRemoveManualRecord(record.id)}>
                              删
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <strong>还没有记录</strong>
                    <span>导入 CSV 或新增手动记录后会显示在这里。</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function exclusionLabel(exclusion: RecordExclusion | undefined): string {
  if (!exclusion) return "正常";
  if (exclusion.status === "excluded") return exclusion.reason === "zero-score" ? "已排除 · 0分" : "已排除";
  return "需留意";
}
