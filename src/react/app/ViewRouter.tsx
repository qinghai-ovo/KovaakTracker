import type { ReactNode } from "react";
import type { AppView } from "./appNavigation.ts";

interface ViewRouterProps {
  activeView: AppView;
  dailyReview: ReactNode;
  importData: ReactNode;
  records: ReactNode;
  scenarios: ReactNode;
  settings: ReactNode;
  weeklyReview: ReactNode;
}

export function ViewRouter({ activeView, dailyReview, importData, records, scenarios, settings, weeklyReview }: ViewRouterProps) {
  if (activeView === "import-data") return <>{importData}</>;
  if (activeView === "settings") return <>{settings}</>;
  if (activeView === "weekly-review") return <>{weeklyReview}</>;
  if (activeView === "scenarios") return <>{scenarios}</>;
  if (activeView === "records") return <>{records}</>;
  return <>{dailyReview}</>;
}
