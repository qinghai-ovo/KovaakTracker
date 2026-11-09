import type { ReactNode } from "react";
import type { StableWindow } from "../../domain/metrics.ts";
import type { SuspiciousPolicy } from "../../domain/exclusions.ts";
import type { SetupProfile } from "../../domain/types.ts";
import { useSnapshot, useTrackerData } from "../../app/data.tsx";
import { trackedId } from "../../data/trackerData.ts";
import { useAction } from "../../app/useAction.ts";
import { ensureNotificationPermission, notificationsBlocked } from "../../app/useRunNotifications.ts";
import { routeHref } from "../../app/router.ts";
import { Segmented, SettingRow, Switch, TextField } from "../../ui/Controls.tsx";
import { fmtDateTime } from "../../ui/format.ts";
import "./settings.css";

const UNAVAILABLE = "示例数据里不可用";

export function SettingsScreen() {
  const data = useTrackerData();
  const snapshot = useSnapshot();
  const { settings, preferences, setup, benchmark } = snapshot;
  const [runSync, syncing, syncMessage] = useAction();
  const [runFolder, choosing, folderMessage] = useAction();

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
            <select
              id="benchmark-select"
              className="select"
              style={{ minWidth: 220 }}
              value={benchmark.name}
              disabled={!data.selectBenchmark || benchmark.available.length < 2}
              title={data.selectBenchmark ? undefined : UNAVAILABLE}
              onChange={(event) => data.selectBenchmark?.(event.target.value)}
            >
              {(benchmark.available.length ? benchmark.available : [benchmark.name]).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label="侧栏里追踪" help="勾选要追踪的难度，它们会列在侧栏里，点一下即可切换；在侧栏拖动调整顺序">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              {snapshot.catalog.map((entry) => (
                <div key={entry.benchmark} role="group" aria-label={`${entry.benchmark} 的难度`} style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                  {snapshot.catalog.length > 1 ? <span className="small muted" style={{ marginRight: 4 }}>{entry.benchmark}</span> : null}
                  {entry.difficulties.map((difficulty) => {
                    const id = trackedId(entry.benchmark, difficulty);
                    const on = snapshot.tracked.some((item) => item.id === id);
                    const last = on && snapshot.tracked.length === 1;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="chip"
                        aria-pressed={on}
                        disabled={last}
                        title={last ? "至少要追踪一个" : undefined}
                        onClick={() => data.setTracked(entry.benchmark, difficulty, !on)}
                      >
                        {difficulty}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </SettingRow>
          <SettingRow label="当前显示" help="各页面按这个难度的分数线计算段位">
            <Segmented label="难度" value={benchmark.difficulty} options={benchmark.difficulties.map((value) => ({ value, label: value }))} onChange={(value) => data.setDifficulty(value)} />
          </SettingRow>
          <SettingRow
            label="段位线"
            help={
              <>
                {benchmark.syncedAt ? `${fmtDateTime(benchmark.syncedAt)} 同步` : "还没同步"} · {benchmark.scenarios.length} 个场景 · 离线时使用上次同步的数据
                {syncMessage ? <span style={{ display: "block", color: syncMessage.startsWith("出错") ? "var(--negative)" : "var(--accent)" }}>{syncMessage}</span> : null}
              </>
            }
          >
            <button type="button" className="btn-secondary" disabled={!data.syncBenchmark || syncing} title={data.syncBenchmark ? "从 EVXL 和 KovaaK 读取场景与段位线" : UNAVAILABLE} onClick={() => void runSync(() => data.syncBenchmark!())}>
              {syncing ? "同步中…" : "立即同步"}
            </button>
          </SettingRow>
        </SettingsSection>

        <SettingsSection title="成绩来源">
          <SettingRow
            label="Stats 文件夹"
            help={
              <>
                <span className="mono" style={{ wordBreak: "break-all" }}>{snapshot.statsDir ?? "还没选择"}</span>
                {folderMessage ? <span style={{ display: "block", color: folderMessage.startsWith("出错") ? "var(--negative)" : "var(--accent)" }}>{folderMessage}</span> : null}
              </>
            }
          >
            <button type="button" className="btn-secondary" disabled={!data.chooseStatsFolder || choosing} title={data.chooseStatsFolder ? undefined : UNAVAILABLE} onClick={() => void runFolder(() => data.chooseStatsFolder!())}>
              {snapshot.statsDir ? "更换" : "选择"}
            </button>
          </SettingRow>
          <SettingRow label="自动导入新成绩" help={snapshot.source === "browser" ? "页面开着时每 15 秒检查一次文件夹里的新成绩" : "监听文件夹，KovaaK 写出成绩文件后立即导入"}>
            <Switch label="自动导入新成绩" checked={preferences.autoImport} onChange={(autoImport) => data.updatePreferences({ autoImport })} />
          </SettingRow>
          <SettingRow
            label="打完一局后通知"
            help={
              notificationsBlocked()
                ? "浏览器已禁止这个页面发通知，请在地址栏左侧的网站设置里允许"
                : snapshot.source === "tauri"
                  ? "游戏里也能看到分数、个人最佳和升段提示（窗口不在前台或收进托盘时弹出 Windows 通知）"
                  : "游戏里也能看到分数、个人最佳和升段提示（页面不在前台时弹出系统通知）"
            }
          >
            <Switch
              label="打完一局后通知"
              checked={preferences.notifyAfterRun}
              onChange={(notifyAfterRun) => {
                data.updatePreferences({ notifyAfterRun });
                // The browser only shows notifications after the user allows them.
                if (notifyAfterRun) void ensureNotificationPermission();
              }}
            />
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
