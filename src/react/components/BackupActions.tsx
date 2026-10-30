import { useRef } from "react";

interface BackupActionsProps {
  onExportBackup: () => void;
  onImportBackupFile: (file: File) => void;
}

export function BackupActions({ onExportBackup, onImportBackupFile }: BackupActionsProps) {
  const jsonInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="top-actions">
      <button className="ghost-button" type="button" onClick={onExportBackup}>
        导出 JSON
      </button>
      <button className="ghost-button" type="button" onClick={() => jsonInputRef.current?.click()}>
        导入 JSON
      </button>
      <input
        ref={jsonInputRef}
        className="hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onImportBackupFile(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
