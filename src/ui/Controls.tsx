import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: SegmentedOption<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__item"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span className="switch__knob" />
    </button>
  );
}

/** One settings row: label + help on the left, control on the right. */
export function SettingRow({ label, help, htmlFor, children }: { label: string; help?: ReactNode; htmlFor?: string; children: ReactNode }) {
  const text = (
    <>
      <span className="setting-row__label">{label}</span>
      {help ? <span className="setting-row__help">{help}</span> : null}
    </>
  );
  return (
    <div className="setting-row">
      {htmlFor ? (
        <label className="setting-row__text" htmlFor={htmlFor}>
          {text}
        </label>
      ) : (
        <div className="setting-row__text">{text}</div>
      )}
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: "numeric" | "decimal" | "text" }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" value={value} placeholder={placeholder} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
