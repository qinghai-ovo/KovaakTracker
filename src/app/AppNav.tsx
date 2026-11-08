import { sourceLabel } from "../ui/format.ts";
import type { ReactNode } from "react";
import type { TrackerSnapshot } from "../data/trackerData.ts";
import type { RankView } from "../domain/screens/shared.ts";
import type { RankStyle } from "../ui/rankStyle.ts";
import { TrackedBenchmarks } from "./TrackedBenchmarks.tsx";
import { routeHref, type RouteName } from "./router.ts";

const ICONS: Record<RouteName, ReactNode> = {
  today: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  map: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  journal: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
};

const PRIMARY: Array<[RouteName, string]> = [
  ["today", "今天"],
  ["map", "能力地图"],
  ["journal", "训练日志"],
];
const SECONDARY: Array<[RouteName, string]> = [
  ["data", "数据"],
  ["settings", "设置"],
];

interface AppNavProps {
  active: RouteName;
  snapshot: TrackerSnapshot;
  overall: RankView;
  styles: RankStyle[];
}

function watchLabel(snapshot: TrackerSnapshot): string {
  if (snapshot.watching) return "正在监听 stats";
  if (snapshot.folderAccess === "needs-permission") return "需要重新授权 stats";
  if (snapshot.source !== "fixture" && !snapshot.statsDir) return "还没选择 stats 文件夹";
  if (snapshot.folderError) return "stats 文件夹无法访问";
  return "未在监听";
}

export function AppNav({ active, snapshot, overall, styles }: AppNavProps) {
  const link = ([name, label]: [RouteName, string]) => (
    <a key={name} className="nav__link" href={routeHref(name)} aria-current={name === active ? "page" : undefined}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </svg>
      <span>{label}</span>
    </a>
  );

  return (
    <nav className="nav" aria-label="主导航">
      <div className="nav__brand">
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="14" cy="14" r="10" />
          <circle cx="14" cy="14" r="3" />
          <path d="M14 1v6M14 21v6M1 14h6M21 14h6" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="nav__brand-name">Kovaak</span>
          <span className="nav__brand-sub">TRACKER</span>
        </div>
      </div>

      <div className="nav__links">
        {PRIMARY.map(link)}
        <span className="nav__divider" aria-hidden="true" />
        {SECONDARY.map(link)}
      </div>

      <TrackedBenchmarks snapshot={snapshot} activeOverall={overall} />

      <div className="nav__live">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={snapshot.watching ? "live-dot" : "live-dot is-off"} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>{watchLabel(snapshot)}</span>
        </div>
        <span className="small muted">
          上次导入 {snapshot.lastImportAt ?? "—"}
          {sourceLabel(snapshot.source)}
        </span>
      </div>
    </nav>
  );
}
