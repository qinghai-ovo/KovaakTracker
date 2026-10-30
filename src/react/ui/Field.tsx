import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
}

export function Field({ className = "", label, ...props }: FieldProps) {
  return (
    <label className={["ui-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
