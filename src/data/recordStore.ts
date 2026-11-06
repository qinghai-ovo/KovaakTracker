// Imported stats runs live in IndexedDB: a long KovaaK history (10k+ runs) does not fit in
// localStorage, whose ~5 MB limit made large imports fail silently.
import type { ScoreRecord } from "../domain/types.ts";

export interface RecordStore {
  loadAll(): Promise<ScoreRecord[]>;
  put(records: ScoreRecord[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  replaceAll(records: ScoreRecord[]): Promise<void>;
}

/** Only what the app uses; the raw CSV fields made each run ~2.7 KB. */
export function compactRecord(record: ScoreRecord): ScoreRecord {
  const metadata = record.metadata;
  return {
    id: record.id,
    scenario: record.scenario,
    ...(record.rawScenario && record.rawScenario !== record.scenario ? { rawScenario: record.rawScenario } : {}),
    score: record.score,
    date: record.date,
    source: "csv",
    ...(metadata
      ? {
          metadata: {
            sourceFile: metadata.sourceFile,
            sourceType: "csv",
            ...(metadata.sensitivity !== undefined ? { sensitivity: metadata.sensitivity } : {}),
            ...(metadata.fov !== undefined ? { fov: metadata.fov } : {}),
            ...(metadata.dpi !== undefined ? { dpi: metadata.dpi } : {}),
          },
        }
      : {}),
  };
}

const DB_NAME = "kovaak-tracker";
const STORE = "csvRuns";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function indexedDbRecordStore(factory: IDBFactory = indexedDB): RecordStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = () => {
    db ??= new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return db;
  };
  const write = async (fn: (store: IDBObjectStore) => void) => {
    const tx = (await open()).transaction(STORE, "readwrite");
    fn(tx.objectStore(STORE));
    await done(tx);
  };
  return {
    async loadAll() {
      const tx = (await open()).transaction(STORE, "readonly");
      return request(tx.objectStore(STORE).getAll() as IDBRequest<ScoreRecord[]>);
    },
    put: (records) => write((store) => records.forEach((record) => store.put(record))),
    remove: (ids) => write((store) => ids.forEach((id) => store.delete(id))),
    replaceAll: (records) =>
      write((store) => {
        store.clear();
        records.forEach((record) => store.put(record));
      }),
  };
}

/** In-memory store for tests and browsers without IndexedDB. */
export function memoryRecordStore(initial: ScoreRecord[] = []): RecordStore {
  const items = new Map(initial.map((record) => [record.id ?? "", record]));
  return {
    loadAll: async () => [...items.values()],
    put: async (records) => records.forEach((record) => items.set(record.id ?? "", record)),
    remove: async (ids) => ids.forEach((id) => items.delete(id)),
    replaceAll: async (records) => {
      items.clear();
      records.forEach((record) => items.set(record.id ?? "", record));
    },
  };
}
