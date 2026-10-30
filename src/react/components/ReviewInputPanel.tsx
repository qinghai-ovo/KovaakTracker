import { recordKey } from "../../core/exclusions.ts";
import { inferTrainingTimeForDate, resolvedSetupProfile } from "../../core/reviewInputs.ts";
import { localDateKey } from "../../core/stats.ts";
import type { DailyReviewEntry, RecordExclusion, ScoreRecord, SetupProfile } from "../../core/types.ts";

interface ReviewInputPanelProps {
  dateKey: string;
  defaultSetupProfile: SetupProfile;
  dailyReview: DailyReviewEntry | undefined;
  records: ScoreRecord[];
  recordExclusions: Record<string, RecordExclusion>;
  onRestoreAutoTime: (dateKey: string) => void;
  onUpdateDailyReview: (dateKey: string, entry: Partial<DailyReviewEntry>) => void;
  onUpdateDailySetupOverride: (dateKey: string, setup: Partial<SetupProfile>) => void;
  onUpdateDefaultSetupProfile: (profile: Partial<SetupProfile>) => void;
}

const setupFields: Array<{ key: keyof SetupProfile; label: string }> = [
  { key: "mouse", label: "鼠标" },
  { key: "mousepad", label: "鼠标垫" },
  { key: "sensitivity", label: "灵敏度" },
  { key: "dpi", label: "DPI" },
  { key: "fov", label: "FOV" },
  { key: "notes", label: "说明" },
];

export function ReviewInputPanel({
  dateKey,
  dailyReview,
  defaultSetupProfile,
  onRestoreAutoTime,
  onUpdateDailyReview,
  onUpdateDailySetupOverride,
  onUpdateDefaultSetupProfile,
  recordExclusions,
  records,
}: ReviewInputPanelProps) {
  const inferredTime = inferTrainingTimeForDate(records, recordExclusions, dateKey);
  const time = dailyReview?.trainingTimeOverride || inferredTime || { start: "", end: "" };
  const setup = resolvedSetupProfile(defaultSetupProfile, dailyReview);
  const dayRecords = records.filter((record) => localDateKey(record.date) === dateKey);
  const excludedCount = dayRecords.filter((record) => recordExclusions[recordKey(record)]?.status === "excluded").length;
  const suspiciousCount = dayRecords.filter((record) => recordExclusions[recordKey(record)]?.status === "suspicious").length;

  return (
    <section className="panel review-input-panel">
      <div className="panel-heading">
        <div>
          <h2>复盘输入</h2>
          <p className="subtitle">{dateKey} · 每日备注、训练时间和设备设置</p>
        </div>
        <span>{dailyReview?.trainingTimeOverride ? "手动时间" : "自动时间"}</span>
      </div>
      <div className="review-input-grid">
        <label>
          每日备注
          <textarea value={dailyReview?.note || ""} onChange={(event) => onUpdateDailyReview(dateKey, { note: event.target.value })} rows={4} />
        </label>
        <div className="review-input-side">
          <div className="review-time-grid">
            <label>
              开始
              <input value={time.start} onChange={(event) => onUpdateDailyReview(dateKey, { trainingTimeOverride: { start: event.target.value, end: time.end } })} type="time" />
            </label>
            <label>
              结束
              <input value={time.end} onChange={(event) => onUpdateDailyReview(dateKey, { trainingTimeOverride: { start: time.start, end: event.target.value } })} type="time" />
            </label>
            <button className="ghost-button" type="button" onClick={() => onRestoreAutoTime(dateKey)}>
              恢复自动
            </button>
          </div>
          <div className="review-anomaly-summary">
            <span>当天 runs：{dayRecords.length}</span>
            <span>需留意：{suspiciousCount}</span>
            <span>已排除：{excludedCount}</span>
          </div>
        </div>
      </div>
      <div className="review-setup-grid">
        <SetupEditor title="默认设备/Profile" profile={defaultSetupProfile} onChange={onUpdateDefaultSetupProfile} />
        <SetupEditor title="当天覆盖" profile={setup} onChange={(profile) => onUpdateDailySetupOverride(dateKey, profile)} />
      </div>
    </section>
  );
}

function SetupEditor({ onChange, profile, title }: { title: string; profile: SetupProfile; onChange: (profile: Partial<SetupProfile>) => void }) {
  return (
    <div className="review-setup-editor">
      <h3>{title}</h3>
      <div className="field-grid">
        {setupFields.map((field) => (
          <label key={field.key}>
            {field.label}
            <input value={profile[field.key]} onChange={(event) => onChange({ [field.key]: event.target.value })} />
          </label>
        ))}
      </div>
    </div>
  );
}
