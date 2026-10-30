import type { AppState } from "../core/types.ts";

export interface ExportJsonOptions {
  BlobImpl?: typeof Blob;
  URLImpl?: typeof URL;
  documentRef?: Document;
  now?: Date;
}

export function exportJson(
  state: AppState,
  { BlobImpl = Blob, URLImpl = URL, documentRef = document, now = new Date() }: ExportJsonOptions = {},
): void {
  const blob = new BlobImpl([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URLImpl.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = `kovaak-benchmark-tracker-${now.toISOString().slice(0, 10)}.json`;
  anchor.click();
  URLImpl.revokeObjectURL(url);
}

export async function readJsonFile(file: { text(): Promise<string> }): Promise<unknown> {
  return JSON.parse(await file.text());
}
