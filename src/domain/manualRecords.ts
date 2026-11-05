import type { ScoreRecord } from "./types.ts";

export interface ManualRecordFormData {
  scenario: string;
  score: number;
  date: Date;
  note: string;
}

export function recordFromForm({ scenario, score, date, note }: ManualRecordFormData, idFactory: () => string): ScoreRecord {
  return {
    id: idFactory(),
    scenario,
    score,
    date: date.toISOString(),
    note,
    source: "manual",
  };
}

export function upsertManualRecord(
  records: ScoreRecord[],
  formData: ManualRecordFormData,
  editingId: string | null,
  idFactory: () => string,
): ScoreRecord[] {
  if (editingId) {
    return records.map((record) =>
      record.id === editingId
        ? { ...record, scenario: formData.scenario, score: formData.score, date: formData.date.toISOString(), note: formData.note }
        : record,
    );
  }
  return [...records, recordFromForm(formData, idFactory)];
}

export function deleteManualRecord(records: ScoreRecord[], id: string): ScoreRecord[] {
  return records.filter((record) => record.id !== id);
}

export function clearManualRecords(): ScoreRecord[] {
  return [];
}
