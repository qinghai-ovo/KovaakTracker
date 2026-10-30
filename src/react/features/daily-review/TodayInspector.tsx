import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { recordKey } from "../../../core/exclusions.ts";
import { inferTrainingTimeForDate, resolvedSetupProfile } from "../../../core/reviewInputs.ts";
import { localDateKey } from "../../../core/stats.ts";
import type { DailyReviewEntry, DailyReviewState, RecordExclusion, ScoreRecord, SetupProfile } from "../../../core/types.ts";
import { Button } from "../../ui/Button.tsx";
import { Field } from "../../ui/Field.tsx";
import { Panel } from "../../ui/Panel.tsx";

interface TodayInspectorProps {
  dailyReview: DailyReviewEntry | undefined;
  dateKey: string;
  defaultSetupProfile: SetupProfile;
  focusHint: string;
  onRestoreAutoTime: (dateKey: string) => void;
  onUpdateDailyReview: (dateKey: string, entry: Partial<DailyReviewEntry>) => void;
  onUpdateDailySetupOverride: (dateKey: string, setup: Partial<SetupProfile>) => void;
  recordExclusions: Record<string, RecordExclusion>;
  records: ScoreRecord[];
}

const setupFields: Array<{ key: keyof SetupProfile; label: string }> = [
  { key: "mouse", label: "Mouse" },
  { key: "mousepad", label: "Mousepad" },
  { key: "sensitivity", label: "Sensitivity" },
  { key: "dpi", label: "DPI" },
  { key: "fov", label: "FOV" },
  { key: "notes", label: "Notes" },
];

const stateFields: Array<{ key: keyof DailyReviewState; label: string; placeholder: string }> = [
  { key: "fatigue", label: "Fatigue", placeholder: "low / medium / high" },
  { key: "sleep", label: "Sleep", placeholder: "hours or quality" },
  { key: "caffeine", label: "Caffeine", placeholder: "none / coffee / timing" },
  { key: "warmup", label: "Warmup", placeholder: "routine or duration" },
];

export function TodayInspector({
  dailyReview,
  dateKey,
  defaultSetupProfile,
  focusHint,
  onRestoreAutoTime,
  onUpdateDailyReview,
  onUpdateDailySetupOverride,
  recordExclusions,
  records,
}: TodayInspectorProps) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [savedLabel, setSavedLabel] = useState("Saved");
  const inferredTime = inferTrainingTimeForDate(records, recordExclusions, dateKey);
  const time = dailyReview?.trainingTimeOverride || inferredTime || { start: "", end: "" };
  const setup = resolvedSetupProfile(defaultSetupProfile, dailyReview);
  const dayRecords = records.filter((record) => localDateKey(record.date) === dateKey);
  const excludedCount = dayRecords.filter((record) => recordExclusions[recordKey(record)]?.status === "excluded").length;
  const suspiciousCount = dayRecords.filter((record) => recordExclusions[recordKey(record)]?.status === "suspicious").length;

  useEffect(() => {
    setSavedLabel("Saved");
  }, [dailyReview, defaultSetupProfile]);

  function updateReview(entry: Partial<DailyReviewEntry>) {
    setSavedLabel("Saving...");
    onUpdateDailyReview(dateKey, entry);
  }

  function updateState(key: keyof DailyReviewState, value: string) {
    updateReview({ state: { caffeine: "", fatigue: "", sleep: "", warmup: "", ...(dailyReview?.state || {}), [key]: value } });
  }

  return (
    <Panel className="inspector-panel" elevated>
      <div className="inspector-header">
        <div>
          <h2>Today</h2>
          <p>{dateKey || "No training date selected"}</p>
        </div>
        <span className="inspector-save-state">{savedLabel}</span>
      </div>

      <section className="inspector-section">
        <h3>Daily Notes</h3>
        <textarea
          className="inspector-note"
          value={dailyReview?.note || ""}
          onChange={(event) => updateReview({ note: event.target.value })}
          placeholder="State, fatigue, warmup, setup changes..."
        />
      </section>

      <section className="inspector-section">
        <h3>State</h3>
        <div className="inspector-two-col">
          {stateFields.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              placeholder={field.placeholder}
              value={dailyReview?.state?.[field.key] || ""}
              onChange={(event) => updateState(field.key, event.target.value)}
            />
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <h3>Training Time</h3>
        <div className="inspector-two-col">
          <Field label="Start" type="time" value={time.start} onChange={(event) => updateReview({ trainingTimeOverride: { start: event.target.value, end: time.end } })} />
          <Field label="End" type="time" value={time.end} onChange={(event) => updateReview({ trainingTimeOverride: { start: time.start, end: event.target.value } })} />
        </div>
        <Button onClick={() => onRestoreAutoTime(dateKey)} size="sm" variant="ghost">
          Restore inferred time
        </Button>
      </section>

      <section className="inspector-section">
        <h3>Run State</h3>
        <div className="inspector-stat-grid">
          <div className="inspector-stat">
            <span>Runs</span>
            <strong>{dayRecords.length}</strong>
          </div>
          <div className="inspector-stat">
            <span>Suspicious</span>
            <strong>{suspiciousCount}</strong>
          </div>
          <div className="inspector-stat">
            <span>Excluded</span>
            <strong>{excludedCount}</strong>
          </div>
          <div className="inspector-stat">
            <span>Focus</span>
            <strong>{focusHint.replace("Next focus: ", "")}</strong>
          </div>
        </div>
      </section>

      <section className="inspector-section">
        <button className="inspector-disclosure" type="button" onClick={() => setSetupOpen((value) => !value)}>
          {setupOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span>Setup Override</span>
        </button>
        {setupOpen ? (
          <div className="setup-grid">
            {setupFields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                value={setup[field.key]}
                onChange={(event) => {
                  setSavedLabel("Saving...");
                  onUpdateDailySetupOverride(dateKey, { [field.key]: event.target.value });
                }}
              />
            ))}
          </div>
        ) : null}
      </section>
    </Panel>
  );
}
