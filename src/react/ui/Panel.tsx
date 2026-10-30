import type { HTMLAttributes, ReactNode } from "react";

interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  elevated?: boolean;
}

export function Panel({ children, className = "", elevated = false, ...props }: PanelProps) {
  return (
    <section className={["ui-panel", elevated ? "ui-panel-elevated" : "", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </section>
  );
}
