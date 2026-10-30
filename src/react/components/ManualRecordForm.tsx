import { forwardRef, useImperativeHandle, useState } from "react";
import type { BenchmarkScenario, ScoreRecord } from "../../core/types.ts";
import { toDateTimeInputValue } from "../format.ts";

interface ManualRecordFormProps {
  editingId: string | null;
  onCancelEdit: () => void;
  onClearManualRecords: () => void;
  onSaveManualRecord: (record: { scenario: string; score: number; date: Date; note: string }) => void;
  scenarios: BenchmarkScenario[];
}

export interface ManualRecordFormHandle {
  startEdit(record: ScoreRecord): void;
}

export const ManualRecordForm = forwardRef<ManualRecordFormHandle, ManualRecordFormProps>(function ManualRecordForm({
  editingId,
  onCancelEdit,
  onClearManualRecords,
  onSaveManualRecord,
  scenarios,
}: ManualRecordFormProps, ref) {
  const [manualScenario, setManualScenario] = useState("");
  const [manualScore, setManualScore] = useState("");
  const [manualDate, setManualDate] = useState(() => toDateTimeInputValue(new Date()));
  const [manualNote, setManualNote] = useState("");

  useImperativeHandle(ref, () => ({
    startEdit(record) {
      setManualScenario(record.scenario);
      setManualScore(String(record.score));
      setManualDate(toDateTimeInputValue(new Date(record.date)));
      setManualNote(record.note || "");
    },
  }));

  function submitManualRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const score = Number(manualScore);
    const date = new Date(manualDate);
    if (!manualScenario.trim() || Number.isNaN(score) || Number.isNaN(date.getTime())) return;
    onSaveManualRecord({
      scenario: manualScenario.trim(),
      score,
      date,
      note: manualNote.trim(),
    });
    resetManualForm();
  }

  function cancelEdit() {
    onCancelEdit();
    resetManualForm();
  }

  function resetManualForm() {
    setManualScenario("");
    setManualScore("");
    setManualDate(toDateTimeInputValue(new Date()));
    setManualNote("");
  }

  return (
    <section className="panel entry-panel">
      <div className="panel-heading">
        <h2>手动记录</h2>
        <button className="danger-button" type="button" onClick={onClearManualRecords}>
          清空
        </button>
      </div>
      <form className="field-grid" onSubmit={submitManualRecord}>
        <label>
          场景
          <input value={manualScenario} onChange={(event) => setManualScenario(event.target.value)} list="scenarioOptions" />
        </label>
        <label>
          分数
          <input value={manualScore} onChange={(event) => setManualScore(event.target.value)} type="number" step="any" />
        </label>
        <label>
          日期
          <input value={manualDate} onChange={(event) => setManualDate(event.target.value)} type="datetime-local" />
        </label>
        <label>
          备注
          <input value={manualNote} onChange={(event) => setManualNote(event.target.value)} />
        </label>
        <div className="form-actions no-pad">
          <button className="primary-button" type="submit">
            {editingId ? "更新成绩" : "保存成绩"}
          </button>
          {editingId ? (
            <button className="ghost-button" type="button" onClick={cancelEdit}>
              取消编辑
            </button>
          ) : null}
        </div>
      </form>
      <datalist id="scenarioOptions">
        {scenarios.map((scenario) => (
          <option key={scenario.name} value={scenario.name} />
        ))}
      </datalist>
    </section>
  );
});
