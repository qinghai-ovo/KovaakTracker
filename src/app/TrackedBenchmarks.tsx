import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { RankView } from "../domain/screens/shared.ts";
import type { TrackedBenchmark, TrackerSnapshot } from "../data/trackerData.ts";
import { RankPalette } from "../ui/RankBars.tsx";
import { rankStyleAt } from "../ui/rankStyle.ts";
import { useTrackedSummaries, useTrackerData, type TrackedSummary } from "./data.tsx";
import { routeHref } from "./router.ts";

/** "Viscose Benchmarks S2" → "Viscose S2" to fit the sidebar; the full name stays in the tooltip. */
function shortBenchmarkName(name: string): string {
  return name.replace(/\s+Benchmarks?\b/i, "").trim() || name;
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Every followed benchmark in the sidebar. Click one to make it active; drag the grip (or press
 * Alt+↑ / Alt+↓ on a focused item) to change the order.
 */
export function TrackedBenchmarks({ snapshot, activeOverall }: { snapshot: TrackerSnapshot; activeOverall: RankView }) {
  const data = useTrackerData();
  const summaries = useTrackedSummaries(snapshot, activeOverall);
  const [dragId, setDragId] = useState<string | null>(null);
  /** Insertion point while dragging: the item is dropped before this index. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const tracked = snapshot.tracked;
  const ids = tracked.map((entry) => entry.id);

  const commit = (from: number, to: number) => {
    if (from < 0 || to < 0 || to > tracked.length || from === to || from + 1 === to) return;
    data.reorderTracked(moveItem(ids, from, to > from ? to - 1 : to));
  };

  const onDragOver = (event: DragEvent<HTMLLIElement>, index: number) => {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    setDropIndex(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    if (dragId !== null && dropIndex !== null) commit(ids.indexOf(dragId), dropIndex);
    setDragId(null);
    setDropIndex(null);
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const target = event.key === "ArrowUp" ? index - 1 : index + 2;
    if (target < 0 || target > tracked.length) return;
    commit(index, target);
    // Keep focus on the moved item after the list re-renders.
    const id = ids[index];
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-tracked-id="${CSS.escape(id)}"]`)?.focus());
  };

  return (
    <div className="nav__bench">
      <div className="nav__row">
        <span className="mono faint" style={{ fontSize: 10, letterSpacing: "0.2em" }}>
          BENCHMARK
        </span>
        <a href={routeHref("settings")} className="small" style={{ fontWeight: 500 }}>
          管理
        </a>
      </div>
      <ul className="tracked" aria-label="追踪的 benchmark，按住左侧把手拖动排序，或按 Alt+上下方向键">
        {tracked.map((entry, index) => (
          <TrackedItem
            key={entry.id}
            entry={entry}
            summary={summaries.get(entry.id)}
            dragging={dragId === entry.id}
            dropBefore={dragId !== null && dropIndex === index}
            dropAfter={dragId !== null && dropIndex === tracked.length && index === tracked.length - 1}
            canReorder={tracked.length > 1}
            onSelect={() => data.selectTracked(entry.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onDragStart={(event) => {
              setDragId(entry.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", entry.id);
            }}
            onDragOver={(event) => onDragOver(event, index)}
            onDrop={onDrop}
            onDragEnd={() => {
              setDragId(null);
              setDropIndex(null);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

interface TrackedItemProps {
  entry: TrackedBenchmark;
  summary: TrackedSummary | undefined;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  canReorder: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: (event: DragEvent) => void;
  onDragEnd: () => void;
}

function TrackedItem({ entry, summary, dragging, dropBefore, dropAfter, canReorder, onSelect, onKeyDown, onDragStart, onDragOver, onDrop, onDragEnd }: TrackedItemProps) {
  const styles = summary?.styles ?? [];
  const overall = summary?.overall ?? null;
  const ink = overall ? rankStyleAt(styles, overall.index).ink : "var(--faint)";
  const className = ["tracked__item", entry.active ? "is-active" : "", dragging ? "is-dragging" : "", dropBefore ? "drop-before" : "", dropAfter ? "drop-after" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <li className={className} draggable={canReorder} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}>
      {canReorder ? (
        <span className="tracked__grip" aria-hidden="true" title="拖动调整顺序">
          <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
            <circle cx="2" cy="2" r="1.2" />
            <circle cx="6" cy="2" r="1.2" />
            <circle cx="2" cy="7" r="1.2" />
            <circle cx="6" cy="7" r="1.2" />
            <circle cx="2" cy="12" r="1.2" />
            <circle cx="6" cy="12" r="1.2" />
          </svg>
        </span>
      ) : null}
      <button
        type="button"
        className="tracked__body"
        data-tracked-id={entry.id}
        aria-current={entry.active ? "true" : undefined}
        title={`${entry.benchmark} · ${entry.difficulty}`}
        onClick={onSelect}
        onKeyDown={onKeyDown}
      >
        <span className="nav__row">
          <span className="tracked__name">{shortBenchmarkName(entry.benchmark)}</span>
          <span className="small muted">{entry.difficulty}</span>
        </span>
        {styles.length ? <RankPalette styles={styles} currentIndex={overall?.index ?? -1} ringGap={entry.active ? "#EEF5F7" : "var(--surface)"} /> : null}
        <span className="nav__row">
          <span className="small muted">综合段位</span>
          {overall ? (
            <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{overall.name}</span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                {overall.index + 1} / {styles.length}
              </span>
            </span>
          ) : (
            <span className="small faint">段位线未同步</span>
          )}
        </span>
      </button>
    </li>
  );
}
