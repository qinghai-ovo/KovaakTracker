import type { ButtonHTMLAttributes, ReactNode } from "react";
import { FloatingTooltip } from "./FloatingTooltip.tsx";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
  selected?: boolean;
}

export function IconButton({ children, className = "", label, selected = false, ...props }: IconButtonProps) {
  return (
    <FloatingTooltip content={label}>
      <button
        aria-label={label}
        className={["ui-icon-button", selected ? "is-selected" : "", className].filter(Boolean).join(" ")}
        type="button"
        {...props}
      >
        {children}
      </button>
    </FloatingTooltip>
  );
}
