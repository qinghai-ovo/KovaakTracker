import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
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

/** Pointer travel before a press turns into a drag, so a plain click still selects. */
const DRAG_THRESHOLD = 5;
/** Distance from the list's top or bottom edge where dragging scrolls the list. */
const EDGE = 36;
/** Fastest auto-scroll, in pixels per 16 ms step. */
const MAX_SPEED = 14;

interface Drag {
  id: string;
  pointerId: number;
  startY: number;
  startScroll: number;
  y: number;
  active: boolean;
  /** How far the item may move up or down and stay inside the list (so it never grows the list). */
  minOffset: number;
  maxOffset: number;
}

/** Insertion index (the item is dropped before it) for a pointer at clientY. */
function dropIndexAt(list: HTMLElement, clientY: number): number {
  const items = [...list.querySelectorAll<HTMLElement>(":scope > .tracked__item")];
  // The dragged item follows the pointer, so only the others mark the gaps.
  const index = items.findIndex((item) => {
    if (item.classList.contains("is-dragging")) return false;
    const rect = item.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  return index < 0 ? items.length : index;
}

/**
 * Every followed benchmark in the sidebar. Click one to make it active; drag it (or press Alt+↑ /
 * Alt+↓ on a focused item) to change the order. Dragging uses pointer events rather than HTML5
 * drag and drop, which the desktop webview reserves for dropping files; holding the item near the
 * top or bottom of the list scrolls it.
 */
export function TrackedBenchmarks({ snapshot, activeOverall }: { snapshot: TrackerSnapshot; activeOverall: RankView }) {
  const data = useTrackerData();
  const summaries = useTrackedSummaries(snapshot, activeOverall);
  const listRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<Drag | null>(null);
  /** Set right after a drag so the click that ends it does not also select the item. */
  const swallowClick = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const tracked = snapshot.tracked;
  const ids = tracked.map((entry) => entry.id);

  const commit = (from: number, to: number) => {
    if (from < 0 || to < 0 || to > tracked.length || from === to || from + 1 === to) return;
    data.reorderTracked(moveItem(ids, from, to > from ? to - 1 : to));
  };

  const update = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  // While dragging near an edge, keep scrolling the list and moving the drop point with it.
  useEffect(() => {
    if (!drag?.active) return;
    const tick = () => {
      const list = listRef.current;
      const current = dragRef.current;
      if (list && current?.active) {
        const rect = list.getBoundingClientRect();
        const over = current.y < rect.top + EDGE ? current.y - (rect.top + EDGE) : current.y > rect.bottom - EDGE ? current.y - (rect.bottom - EDGE) : 0;
        if (over !== 0) {
          const before = list.scrollTop;
          list.scrollTop += Math.max(-MAX_SPEED, Math.min(MAX_SPEED, over / 2));
          if (list.scrollTop !== before) {
            setDrag({ ...current });
            setDropIndex(dropIndexAt(list, current.y));
          }
        }
      }
    };
    const timer = window.setInterval(tick, 16);
    return () => window.clearInterval(timer);
  }, [drag?.active]);

  const onPointerDown = (event: PointerEvent<HTMLLIElement>, id: string) => {
    if (tracked.length < 2 || event.button !== 0 || !listRef.current) return;
    const list = listRef.current;
    const item = event.currentTarget.getBoundingClientRect();
    const top = item.top - list.getBoundingClientRect().top + list.scrollTop;
    update({
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      startScroll: list.scrollTop,
      y: event.clientY,
      active: false,
      minOffset: -top,
      maxOffset: list.scrollHeight - (top + item.height),
    });
  };

  const onPointerMove = (event: PointerEvent<HTMLLIElement>) => {
    const current = dragRef.current;
    const list = listRef.current;
    if (!current || !list || event.pointerId !== current.pointerId) return;
    const active = current.active || Math.abs(event.clientY - current.startY) > DRAG_THRESHOLD;
    if (!active) return;
    if (!current.active) event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    update({ ...current, y: event.clientY, active: true });
    setDropIndex(dropIndexAt(list, event.clientY));
  };

  const finish = (event: PointerEvent<HTMLLIElement>, cancelled: boolean) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (current.active) {
      swallowClick.current = true;
      window.setTimeout(() => (swallowClick.current = false), 0);
      if (!cancelled && dropIndex !== null) commit(ids.indexOf(current.id), dropIndex);
    }
    update(null);
    setDropIndex(null);
  };

  useEffect(() => {
    if (!drag?.active) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      update(null);
      setDropIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag?.active]);

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

  const sorting = drag?.active ? drag : null;
  const offset = sorting && listRef.current ? Math.max(sorting.minOffset, Math.min(sorting.maxOffset, sorting.y - sorting.startY + (listRef.current.scrollTop - sorting.startScroll))) : 0;

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
      <ul ref={listRef} className={sorting ? "tracked is-sorting" : "tracked"} aria-label="追踪的 benchmark，按住拖动排序，或按 Alt+上下方向键">
        {tracked.map((entry, index) => (
          <TrackedItem
            key={entry.id}
            entry={entry}
            summary={summaries.get(entry.id)}
            dragging={sorting?.id === entry.id}
            offset={sorting?.id === entry.id ? offset : 0}
            dropBefore={sorting !== null && dropIndex === index}
            dropAfter={sorting !== null && dropIndex === tracked.length && index === tracked.length - 1}
            canReorder={tracked.length > 1}
            onSelect={() => {
              if (!swallowClick.current) data.selectTracked(entry.id);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            onPointerDown={(event) => onPointerDown(event, entry.id)}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finish(event, false)}
            onPointerCancel={(event) => finish(event, true)}
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
  /** Vertical offset of the dragged item from where it was picked up. */
  offset: number;
  dropBefore: boolean;
  dropAfter: boolean;
  canReorder: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onPointerDown: (event: PointerEvent<HTMLLIElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLLIElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLLIElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLLIElement>) => void;
}

function TrackedItem({ entry, summary, dragging, offset, dropBefore, dropAfter, canReorder, onSelect, onKeyDown, ...pointer }: TrackedItemProps) {
  const styles = summary?.styles ?? [];
  const overall = summary?.overall ?? null;
  const ink = overall ? rankStyleAt(styles, overall.index).ink : "var(--faint)";
  const className = ["tracked__item", entry.active ? "is-active" : "", dragging ? "is-dragging" : "", dropBefore ? "drop-before" : "", dropAfter ? "drop-after" : ""]
    .filter(Boolean)
    .join(" ");
  const style: CSSProperties | undefined = dragging ? { transform: `translateY(${offset}px)` } : undefined;
  return (
    <li className={className} style={style} {...(canReorder ? pointer : {})}>
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
