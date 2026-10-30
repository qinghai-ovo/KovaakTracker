import type { LucideIcon } from "lucide-react";
import { BarChart3, CalendarDays, Database, FileText, LineChart, Settings, Target } from "lucide-react";

export type AppView = "today" | "daily-review" | "weekly-review" | "scenarios" | "records" | "import-data" | "settings";

export interface AppNavigationItem {
  icon: LucideIcon;
  label: string;
  view: AppView;
}

export const appNavigationItems: AppNavigationItem[] = [
  { icon: CalendarDays, label: "Today", view: "today" },
  { icon: BarChart3, label: "Daily Review", view: "daily-review" },
  { icon: LineChart, label: "Weekly Review", view: "weekly-review" },
  { icon: Target, label: "Scenarios", view: "scenarios" },
  { icon: FileText, label: "Records", view: "records" },
  { icon: Database, label: "Import / Data", view: "import-data" },
  { icon: Settings, label: "Settings", view: "settings" },
];
