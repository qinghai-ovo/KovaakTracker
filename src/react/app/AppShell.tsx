import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar.tsx";
import { type AppView } from "./appNavigation.ts";

interface AppShellProps {
  activeView: AppView;
  children: ReactNode;
  inspector: ReactNode;
  inspectorCollapsed: boolean;
  onChangeView: (view: AppView) => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  theme: "dark" | "light" | "system";
  toolbar: ReactNode;
}

export function AppShell({ activeView, children, inspector, inspectorCollapsed, onChangeView, onToggleSidebar, sidebarCollapsed, theme, toolbar }: AppShellProps) {
  return (
    <div className={["app-frame", sidebarCollapsed ? "sidebar-collapsed" : "", inspectorCollapsed ? "inspector-collapsed" : ""].filter(Boolean).join(" ")} data-theme={theme}>
      <Sidebar activeView={activeView} collapsed={sidebarCollapsed} onChangeView={onChangeView} onToggleCollapsed={onToggleSidebar} />
      <div className="app-workspace">
        {toolbar}
        <div className="app-content-grid">
          <main className="app-main">{children}</main>
          <aside className="app-inspector">{inspector}</aside>
        </div>
      </div>
    </div>
  );
}
