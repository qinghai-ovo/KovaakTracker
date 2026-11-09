import type { CSSProperties } from "react";
import { rankSegmentFill } from "../domain/rank.ts";
import { withAlpha, type RankStyle } from "./rankStyle.ts";

interface RankLadderProps {
  thresholds: number[];
  styles: RankStyle[];
  /** Score the segments are filled to (the personal best). */
  score: number | null;
  /** Ladder positions (0..100) for the filled PB marker and the hollow stable marker. */
  pbProgress?: number | null;
  stableProgress?: number | null;
  /** Ladder position (0..100) of today's average, drawn as a diamond. */
  averageProgress?: number | null;
  markerColor?: string;
  size?: "lg" | "sm";
  /** Highest rank reached (the PB rank); its segment is drawn taller with a ring. -1 or omitted: none. */
  currentIndex?: number;
}

/** The rank bar, filled to the PB, with optional PB (filled), stable (hollow) and today's average (diamond) markers. */
export function RankLadder({ thresholds, styles, score, pbProgress, stableProgress, averageProgress, markerColor, size = "lg", currentIndex = -1 }: RankLadderProps) {
  return (
    <span className={`rank-ladder rank-ladder--${size}`}>
      {thresholds.map((threshold, index) => {
        const style = styles[index];
        const fill = score === null ? 0 : rankSegmentFill(score, thresholds, index);
        return (
          <span
            key={`${index}-${threshold}`}
            className={index === currentIndex ? "rank-ladder__seg is-current" : "rank-ladder__seg"}
            title={index === currentIndex ? `最高段位：${style?.name ?? ""}` : undefined}
            style={{ background: withAlpha(style?.fill ?? "#E3E8F0", 0.25), "--ring": style?.ink ?? "var(--muted)" } as CSSProperties}
          >
            <span className="rank-ladder__fill" style={{ width: `${fill}%`, background: style?.fill }} />
          </span>
        );
      })}
      {stableProgress !== null && stableProgress !== undefined ? (
        <span className="rank-ladder__stable" title="稳定水平" style={{ left: `${stableProgress}%` }} />
      ) : null}
      {averageProgress !== null && averageProgress !== undefined ? (
        <span className="rank-ladder__avg" title="今日均分" style={{ left: `${averageProgress}%` }} />
      ) : null}
      {pbProgress !== null && pbProgress !== undefined ? (
        <span className="rank-ladder__pb" title="个人最佳" style={{ left: `${pbProgress}%`, "--marker": markerColor } as CSSProperties} />
      ) : null}
    </span>
  );
}

interface RankPaletteProps {
  styles: RankStyle[];
  /** Current rank: drawn taller with a ring; lower ranks solid, higher ranks faded. */
  currentIndex: number;
  /** Background color the highlight ring separates from. */
  ringGap?: string;
}

/** Compact strip of all ranks with the current one highlighted (sidebar, category headers). */
export function RankPalette({ styles, currentIndex, ringGap = "var(--surface)" }: RankPaletteProps) {
  return (
    <span className="rank-palette" aria-hidden="true">
      {styles.map((style, index) => (
        <span
          key={style.name}
          className={index === currentIndex ? "rank-palette__item is-current" : "rank-palette__item"}
          style={{
            background: index <= currentIndex ? style.fill : withAlpha(style.fill, 0.35),
            boxShadow: index === currentIndex ? `0 0 0 2px ${ringGap}, 0 0 0 3.5px ${style.ink}` : "none",
          }}
        />
      ))}
    </span>
  );
}

export function ProgressRing({ fraction, color, size = 34 }: { fraction: number; color: string; size?: number }) {
  const circumference = 2 * Math.PI * 15;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true" style={{ flex: "none" }}>
      <circle cx="18" cy="18" r="15" fill="none" stroke="var(--track-empty)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r="15"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
        strokeDasharray={`${Math.max(0, Math.min(1, fraction)) * circumference} ${circumference}`}
      />
    </svg>
  );
}

/** Legend mark for today's average, matching the ladder diamond. */
export function LegendDiamond() {
  return <span className="legend-diamond" />;
}

export function LegendDot({ color, hollow = false }: { color: string; hollow?: boolean }) {
  return <span className={hollow ? "legend-dot legend-dot--hollow" : "legend-dot"} style={hollow ? { borderColor: color } : { background: color }} />;
}
