interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

interface SegmentedControlProps<T extends string> {
  ariaLabel?: string;
  className?: string;
  onChange: (value: T) => void;
  options: Array<SegmentedOption<T>>;
  value: T;
}

export function SegmentedControl<T extends string>({ ariaLabel, className = "", onChange, options, value }: SegmentedControlProps<T>) {
  return (
    <div aria-label={ariaLabel} className={["ui-segmented", className].filter(Boolean).join(" ")} role="group">
      {options.map((option) => (
        <button className={option.value === value ? "is-selected" : ""} key={option.value} onClick={() => onChange(option.value)} type="button">
          {option.label}
        </button>
      ))}
    </div>
  );
}
