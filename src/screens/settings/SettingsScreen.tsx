import type { ReactNode } from "react";
import type { StableWindow } from "../../domain/metrics.ts";
import type { SuspiciousPolicy } from "../../domain/exclusions.ts";
import type { OverallRankRule } from "../../domain/category.ts";
import type { SetupProfile } from "../../domain/types.ts";
import { useSnapshot, useTrackerData } from "../../app/data.tsx";
import { routeHref } from "../../app/router.ts";
import { Segmented, SettingRow, Switch, TextField } from "../../ui/Controls.tsx";
import { fmtClock } from "../../ui/format.ts";
import "./settings.css";

const DESKTOP_ONLY = "桌面版（阶段 1）提供";

export function SettingsScreen() {
  const data = useTrackerData();
  const snapshot = useSnapshot();
  const { settings, preferences, setup, benchmark } = snapshot;
  const isDemo = snapshot.source === "fixture";

  const setupFields: Array<[keyof SetupProfile, string, string]> = [
    ["mouse", "鼠标", "你的鼠标型号"],
    ["mousepad", "鼠标垫", "你的鼠标垫"],
    ["sensitivity", "灵敏度（cm/360 或游戏内数值）", ""],
    ["dpi", "DPI", ""],
    ["fov", "FOV", ""],
  ];

  return (
    <>
      <header className="page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="page-header__date">改动会自动保存</span>
          <h1 className="page-title page-title--cjk">设置</h1>
        </div>
      </header>

      <div className="settings-grid">
        <SettingsSection title="Benchmark">
          <SettingRow label="Benchmark" help="决定场景列表、分类和段位线" htmlFor="benchmark-select">
            <select id="benchmark-select" className="select" style={{ minWidth: 220 }} value={benchmark.name} disabled={isDemo} title={isDemo ? "示例数据只有一个 benchmark" : undefined} onChange={() => undefined}>
              <option>{benchmark.name}</option>
            </select>
          </SettingRow>
          <SettingRow label="难度" help="切换后段位按新难度的分数线重新计算">
            <Segmented label="难度" value={benchmark.difficulty} options={benchmark.difficulties.map((value) => ({ value, label: value }))} onChange={(value) => data.setDifficulty(value)} />
          </SettingRow>
          <SettingRow
            label="段位线"
            help={`${benchmark.syncedAt ? `${benchmark.syncedAt.slice(5, 10).replace("-", "月")}日 ${fmtClock(benchmark.syncedAt)} 同步` : "还没同步"} · ${benchmark.scenarios.length} 个场景 · 离线时使用上次同步的数据`}
          >
            <button type="button" className="btn-secondary" disabled={isDemo} title={isDemo ? DESKTOP_ONLY : undefined}>
              立即同步
            </button>
          </SettingRow>
        </SettingsSection>

        <SettingsSection title="成绩来源">
          <SettingRow label="Stats 文件夹" help={<span className="mono" style={{ wordBreak: "break-all" }}>{snapshot.statsDir ?? "还没选择"}</span>}>
            <button type="button" className="btn-secondary" disabled={isDemo} title={isDemo ? DESKTOP_ONLY : undefined}>
              更换
            </button>
          </SettingRow>
          <SettingRow label="自动导入新成绩" help="监听文件夹，KovaaK 写出成绩文件后立即导入">
            <Switch label="自动导入新成绩" checked={preferences.autoImport} onChange={(autoImport) => data.updatePreferences({ autoImport })} />
          </SettingRow>
          <SettingRow label="打完一局后通知" help="游戏里也能看到分数、个人最佳和升段提示">
            <Switch label="打完一局后通知" checked={preferences.notifyAfterRun} onChange={(notifyAfterRun) => data.updatePreferences({ notifyAfterRun })} />
          </SettingRow>
        </SettingsSection>

        <SettingsSection title="统计规则" note="改动后所有页面立即按新规则重新计算">
          <SettingRow label="一天从几点开始" help="练到凌晨的成绩仍算作前一天的训练" htmlFor="day-start">
            <select id="day-start" className="select" style={{ width: 160 }} value={settings.dayStartHour} onChange={(event) => data.updateSettings({ dayStartHour: Number(event.target.value) })}>
              <option value={4}>凌晨 4:00</option>
              <option value={5}>凌晨 5:00</option>
              <option value={6}>凌晨 6:00</option>
              <option value={0}>午夜 0:00</option>
            </select>
          </SettingRow>
          <SettingRow label="稳定水平" help="段位条上空心点的算法；段位本身始终按个人最佳">
            <Segmented<StableWindow>
              label="稳定水平"
              value={settings.stableWindow}
              options={[
                { value: "last10", label: "近 10 局" },
                { value: "last20", label: "近 20 局" },
                { value: "week", label: "本周均分" },
              ]}
              onChange={(stableWindow) => data.updateSettings({ stableWindow })}
            />
          </SettingRow>
          <SettingRow label="可疑成绩" help="低于近期 30 局中位数一半的成绩；0 分成绩总是忽略">
            <Segmented<SuspiciousPolicy>
              label="可疑成绩"
              value={settings.suspiciousPolicy}
              options={[
                { value: "ignore", label: "默认忽略" },
                { value: "warn", label: "只提醒" },
              ]}
              onChange={(suspiciousPolicy) => data.updateSettings({ suspiciousPolicy })}
            />
          </SettingRow>
          <SettingRow label="综合段位" help="侧栏里的综合段位怎么从各分类段位算出来">
            <Segmented<OverallRankRule>
              label="综合段位"
              value={settings.overallRankRule}
              options={[
                { value: "weakest", label: "按最弱分类" },
                { value: "average", label: "按平均" },
              ]}
              onChange={(overallRankRule) => data.updateSettings({ overallRankRule })}
            />
          </SettingRow>
        </SettingsSection>

        <SettingsSection title="默认设备配置" note="某天和这里不同时，日志会提示；单日可以覆盖">
          <div className="settings-fields">
            {setupFields.map(([key, label, placeholder]) => (
              <TextField key={key} label={label} value={setup[key]} placeholder={placeholder} onChange={(value) => data.updateSetup({ [key]: value })} />
            ))}
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span className="field__label">备注</span>
              <textarea className="textarea" rows={2} value={setup.notes} placeholder="比如：换了新鼠标垫，还在适应" onChange={(event) => data.updateSetup({ notes: event.target.value })} />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection title="外观">
          <SettingRow label="主题">
            <Segmented
              label="主题"
              value={preferences.theme}
              options={[
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色", disabled: true, title: "深色主题稍后提供" },
                { value: "system", label: "跟随系统", disabled: true, title: "深色主题稍后提供" },
              ]}
              onChange={(theme) => data.updatePreferences({ theme })}
            />
          </SettingRow>
          <SettingRow label="简化场景名" help="比如把 “VT Smoothbot Arm Easy” 显示为 “Smoothbot Arm”">
            <Switch label="简化场景名" checked={preferences.shortNames} onChange={(shortNames) => data.updatePreferences({ shortNames })} />
          </SettingRow>
          <SettingRow label="显示段内进度" help="段位名旁边显示当前段已经走了多少">
            <Switch label="显示段内进度" checked={preferences.showInRank} onChange={(showInRank) => data.updatePreferences({ showInRank })} />
          </SettingRow>
        </SettingsSection>

        <section className="settings-backup">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>备份与导入</span>
            <span className="small muted">成绩、笔记和设置都在数据页导出和导入</span>
          </div>
          <a href={routeHref("data")} className="btn-link">
            前往数据页
          </a>
        </section>
      </div>
    </>
  );
}

function SettingsSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="card settings-section">
      <div className="card__head">
        <h2 className="card__title">{title}</h2>
        {note ? <span className="small muted">{note}</span> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}
