import type { ReactNode } from "react";

interface EmptyStateProps {
  children?: ReactNode;
  title: string;
}

export function EmptyState({ children, title }: EmptyStateProps) {
  return (
    <div className="ui-empty-state">
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
    </div>
  );
}
