import { defaultDailyReviewTableSettings } from "../../../core/storage.ts";
import type { DailyReviewTableSettings, SetupProfile } from "../../../core/types.ts";
import { Button } from "../../ui/Button.tsx";
import { Field } from "../../ui/Field.tsx";
import { Panel } from "../../ui/Panel.tsx";
import { SegmentedControl } from "../../ui/SegmentedControl.tsx";

interface SettingsViewProps {
  defaultSetupProfile: SetupProfile;
  onUpdateDefaultSetupProfile: (profile: Partial<SetupProfile>) => void;
  onUpdateTableSettings: (settings: Partial<DailyReviewTableSettings>) => void;
  onUpdateTheme: (theme: "dark" | "light" | "system") => void;
  tableSettings: DailyReviewTableSettings;
  theme: "dark" | "light" | "system";
}

const setupFields: Array<{ key: keyof SetupProfile; label: string }> = [
  { key: "mouse", label: "Mouse" },
  { key: "mousepad", label: "Mousepad" },
  { key: "sensitivity", label: "Sensitivity" },
  { key: "dpi", label: "DPI" },
  { key: "fov", label: "FOV" },
  { key: "notes", label: "Notes" },
];

export function SettingsView({
  defaultSetupProfile,
  onUpdateDefaultSetupProfile,
  onUpdateTableSettings,
  onUpdateTheme,
  tableSettings,
  theme,
}: SettingsViewProps) {
  return (
    <div className="view-stack">
      <div className="view-heading">
        <div>
          <h1>Settings</h1>
          <p>UI preferences, Daily Review sheet behavior, and your default setup profile.</p>
        </div>
      </div>
      <div className="settings-grid">
        <Panel className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>Appearance</h2>
              <p className="subtitle">Dark, light, and system themes share the same polished Apple-style tokens.</p>
            </div>
          </div>
          <SegmentedControl
            ariaLabel="Theme"
            onChange={onUpdateTheme}
            options={[
              { label: "Dark", value: "dark" },
              { label: "Light", value: "light" },
              { label: "System", value: "system" },
            ]}
            value={theme}
          />
        </Panel>

        <Panel className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>Daily Review Table</h2>
              <p className="subtitle">
                Density: {tableSettings.density} · Progress: {tableSettings.progressStyle} · Contrast: {tableSettings.highContrast ? "High" : "Standard"}
              </p>
            </div>
            <Button onClick={() => onUpdateTableSettings(defaultDailyReviewTableSettings)} size="sm" variant="ghost">
              Reset
            </Button>
          </div>
          <div className="settings-form-grid">
            <label className="ui-field">
              <span>Density</span>
              <select value={tableSettings.density} onChange={(event) => onUpdateTableSettings({ density: event.target.value as DailyReviewTableSettings["density"] })}>
                <option value="ultra">Ultra</option>
                <option value="compact">Compact</option>
                <option value="normal">Normal</option>
                <option value="wide">Wide</option>
              </select>
            </label>
            <label className="ui-field">
              <span>Progress</span>
              <select value={tableSettings.progressStyle} onChange={(event) => onUpdateTableSettings({ progressStyle: event.target.value as DailyReviewTableSettings["progressStyle"] })}>
                <option value="normal">Rank bars</option>
                <option value="simple">Simple bar</option>
              </select>
            </label>
            <Field label="Text size" max={125} min={80} type="number" value={tableSettings.textSize} onChange={(event) => onUpdateTableSettings({ textSize: Number(event.target.value) })} />
            <Field label="Text contrast" max={100} min={20} type="number" value={tableSettings.textContrast} onChange={(event) => onUpdateTableSettings({ textContrast: Number(event.target.value) })} />
            <Field label="Skew" max={55} min={0} type="number" value={tableSettings.skew} onChange={(event) => onUpdateTableSettings({ skew: Number(event.target.value) })} />
            <Field label="Outer radius" max={18} min={0} type="number" value={tableSettings.outerRadius} onChange={(event) => onUpdateTableSettings({ outerRadius: Number(event.target.value) })} />
          </div>
          <div className="settings-toggle-grid">
            <Toggle label="Bold text" checked={tableSettings.boldText} onChange={(value) => onUpdateTableSettings({ boldText: value })} />
            <Toggle label="Text shadow" checked={tableSettings.textShadow} onChange={(value) => onUpdateTableSettings({ textShadow: value })} />
            <Toggle label="Show progress percent" checked={tableSettings.showProgressPercent} onChange={(value) => onUpdateTableSettings({ showProgressPercent: value })} />
            <Toggle label="Shade category cells" checked={tableSettings.shadeCategoryCells} onChange={(value) => onUpdateTableSettings({ shadeCategoryCells: value })} />
            <Toggle label="Shade rank cells" checked={tableSettings.shadeRankCells} onChange={(value) => onUpdateTableSettings({ shadeRankCells: value })} />
            <Toggle label="High contrast" checked={tableSettings.highContrast} onChange={(value) => onUpdateTableSettings({ highContrast: value })} />
            <Toggle label="Rank colored detail" checked={tableSettings.useRankColumnColors} onChange={(value) => onUpdateTableSettings({ useRankColumnColors: value })} />
            <Toggle label="Simplify scenario names" checked={tableSettings.simplifyScenarioNames} onChange={(value) => onUpdateTableSettings({ simplifyScenarioNames: value })} />
          </div>
        </Panel>

        <Panel className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>Default Setup Profile</h2>
              <p className="subtitle">Used as the baseline; per-day overrides remain in Today Inspector.</p>
            </div>
          </div>
          <div className="settings-form-grid">
            {setupFields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                value={defaultSetupProfile[field.key]}
                onChange={(event) => onUpdateDefaultSetupProfile({ [field.key]: event.target.value })}
              />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <label className="settings-toggle">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
