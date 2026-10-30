import type { ReactNode } from "react";

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
}

export function Tooltip({ children, content }: TooltipProps) {
  return (
    <span className="ui-tooltip">
      {children}
      <span className="ui-tooltip-content" role="tooltip">
        {content}
      </span>
    </span>
  );
}
