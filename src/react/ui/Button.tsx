import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function Button({ children, className = "", size = "md", variant = "secondary", ...props }: ButtonProps) {
  return (
    <button className={["ui-button", `ui-button-${variant}`, `ui-button-${size}`, className].filter(Boolean).join(" ")} type="button" {...props}>
      {children}
    </button>
  );
}
