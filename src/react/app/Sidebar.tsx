import { ChevronLeft, ChevronRight } from "lucide-react";
import { FloatingTooltip } from "../ui/FloatingTooltip.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { appNavigationItems, type AppView } from "./appNavigation.ts";

interface SidebarProps {
  activeView: AppView;
  collapsed: boolean;
  onChangeView: (view: AppView) => void;
  onToggleCollapsed: () => void;
}

export function Sidebar({ activeView, collapsed, onChangeView, onToggleCollapsed }: SidebarProps) {
  return (
    <aside className={["app-sidebar", collapsed ? "is-collapsed" : ""].filter(Boolean).join(" ")}>
      <div className="app-sidebar-head">
        <div className="app-brand" aria-label="Kovaak Tracker" data-tooltip="Kovaak Tracker">
          <span className="app-brand-mark">KT</span>
          <span className="app-brand-text">Kovaak Tracker</span>
        </div>
        <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggleCollapsed}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </IconButton>
      </div>
      <nav className="app-nav" aria-label="Main navigation">
        {appNavigationItems.map((item) => {
          const Icon = item.icon;
          const selected = activeView === item.view;
          const button = (
            <button
              aria-label={item.label}
              className={selected ? "is-selected" : ""}
              key={item.view}
              onClick={() => onChangeView(item.view)}
              type="button"
            >
              <Icon size={18} />
              <span className="app-nav-label">{item.label}</span>
            </button>
          );
          return collapsed ? (
            <FloatingTooltip content={item.label} key={item.view} placement="right" wrapperClassName="app-nav-tooltip">
              {button}
            </FloatingTooltip>
          ) : (
            <span className="app-nav-item" key={item.view}>
              {button}
            </span>
          );
        })}
      </nav>
    </aside>
  );
}
