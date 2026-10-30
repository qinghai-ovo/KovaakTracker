import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { clearManualRecords, deleteManualRecord, upsertManualRecord, type ManualRecordFormData } from "../../core/manualRecords.ts";
import type { AppState, ScoreRecord } from "../../core/types.ts";

export function useManualRecords({
  setSelectedScenario,
  setState,
}: {
  setSelectedScenario: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<AppState>>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const saveManualRecord = useCallback(
    (formData: ManualRecordFormData) => {
      setState((current) => ({
        ...current,
        manualRecords: upsertManualRecord(current.manualRecords, formData, editingId, () => crypto.randomUUID()),
      }));
      setSelectedScenario(formData.scenario);
      setEditingId(null);
    },
    [editingId, setSelectedScenario, setState],
  );

  const startEditManualRecord = useCallback((record: ScoreRecord) => {
    setEditingId(record.id || null);
  }, []);

  const cancelEditManualRecord = useCallback(() => {
    setEditingId(null);
  }, []);

  const removeManualRecord = useCallback((id: string) => {
    setState((current) => ({ ...current, manualRecords: deleteManualRecord(current.manualRecords, id) }));
  }, [setState]);

  const removeAllManualRecords = useCallback(() => {
    setState((current) => ({ ...current, manualRecords: clearManualRecords() }));
  }, [setState]);

  return {
    cancelEditManualRecord,
    editingId,
    removeAllManualRecords,
    removeManualRecord,
    saveManualRecord,
    startEditManualRecord,
  };
}
