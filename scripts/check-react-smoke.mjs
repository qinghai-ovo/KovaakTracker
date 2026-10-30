#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const distDir = path.join(root, "dist");
const storageKey = "kovaak-benchmark-tracker-v2";
const uiPrefsKey = "kovaak-tracker-ui-prefs-v1";

await assertBuildExists(path.join(distDir, "index.html"), "dist/index.html");
await assertBuildExists(path.join(distDir, "react.html"), "dist/react.html");

const browserPath = await findBrowser();
const server = await startStaticServer();

try {
  await runSmokeCase(browserPath, server.origin, "interaction", "/__react-smoke.html");
  await runSmokeCase(browserPath, server.origin, "storage compatibility", "/__react-storage-compat.html");
  await runSmokeCase(browserPath, server.origin, "URL deep link", "/__react-url-deep-link.html");
  console.log("React browser smoke checks passed");
} finally {
  await new Promise((resolve) => server.instance.close(resolve));
}

async function runSmokeCase(browserPath, origin, name, pagePath) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), `kovaak-react-${name.replace(/\W+/g, "-")}-`));
  try {
    const { stdout, stderr } = await runBrowser(browserPath, [
      "--headless=old",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--use-gl=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDir}`,
      "--virtual-time-budget=30000",
      "--dump-dom",
      `${origin}${pagePath}`,
    ]);

    const errorOutput = stderr
      .split(/\r?\n/)
      .filter((line) => /console error|uncaught|runtime error|typeerror|referenceerror|syntaxerror/i.test(line))
      .filter((line) => !/DevTools listening/i.test(line));

    assert.deepEqual(errorOutput, [], `${name} console/runtime error output should be empty, got:\n${errorOutput.join("\n")}`);
    assert.match(stdout, /id="smoke-result"[^>]*data-ok="true"/, `${name} smoke failed:\n${stdout.slice(-2000)}`);
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function assertBuildExists(filePath, label) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${label} not found. Run npm run build before npm run check:react-smoke.`);
  }
}

async function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next browser path.
    }
  }
  throw new Error("Chrome or Edge was not found. Set CHROME_PATH or EDGE_PATH to run the React smoke test.");
}

function runBrowser(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Browser smoke test timed out\n${stderr}`));
    }, 60_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Browser smoke test exited with ${code}\nSTDOUT:\n${stdout.slice(0, 500)}\nSTDERR:\n${stderr}`));
    });
  });
}

async function startStaticServer() {
  const port = await findFreePort();
  const instance = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
      if (url.pathname === "/__react-smoke.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(smokeRunnerHtml("interaction"));
        return;
      }
      if (url.pathname === "/__react-storage-compat.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(smokeRunnerHtml("storage"));
        return;
      }
      if (url.pathname === "/__react-url-deep-link.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(smokeRunnerHtml("url"));
        return;
      }
      const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = path.resolve(distDir, `.${relativePath}`);
      if (!filePath.startsWith(distDir)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const content = await fs.readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((resolve) => instance.listen(port, "127.0.0.1", resolve));
  return { instance, origin: `http://127.0.0.1:${port}` };
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function smokeRunnerHtml(mode) {
  const seed = mode === "storage" ? legacyStorageSeedState() : interactionSeedState();
  return `<!doctype html>
<meta charset="utf-8">
<title>React smoke ${mode}</title>
<pre id="smoke-result" data-ok="pending">pending</pre>
<script>
const storageKey = ${JSON.stringify(storageKey)};
const uiPrefsKey = ${JSON.stringify(uiPrefsKey)};
const mode = ${JSON.stringify(mode)};
const seedState = ${JSON.stringify(seed)};
const result = document.getElementById("smoke-result");
const failures = [];

function pass(details) {
  result.dataset.ok = "true";
  result.textContent = JSON.stringify({ ok: true, mode, details });
}

function fail(error) {
  result.dataset.ok = "false";
  result.textContent = String(error && error.stack ? error.stack : error);
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function waitFor(predicate, message, timeoutMs = 5000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function tick() {
      try {
        const value = predicate();
        if (value) {
          resolve(value);
          return;
        }
      } catch {
        // Keep waiting until timeout so React can finish rendering.
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(message));
        return;
      }
      setTimeout(tick, 50);
    }
    tick();
  });
}

function changeValue(element, value) {
  const view = element.ownerDocument.defaultView;
  const prototype =
    element.tagName === "SELECT"
      ? view.HTMLSelectElement.prototype
      : element.tagName === "TEXTAREA"
        ? view.HTMLTextAreaElement.prototype
        : view.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor.set.call(element, value);
  element.dispatchEvent(new view.Event("input", { bubbles: true }));
  element.dispatchEvent(new view.Event("change", { bubbles: true }));
}

function click(element) {
  expect(element, "click target should exist before dispatch");
  const view = element.ownerDocument.defaultView;
  element.dispatchEvent(new view.MouseEvent("click", { bubbles: true, cancelable: true, view }));
}

function storageState() {
  return JSON.parse(localStorage.getItem(storageKey) || "{}");
}

function uiPrefs() {
  return JSON.parse(localStorage.getItem(uiPrefsKey) || "{}");
}

async function mountApp(initialPath = "./index.html") {
  localStorage.clear();
  localStorage.setItem(storageKey, JSON.stringify(seedState));
  const iframe = document.createElement("iframe");
  iframe.src = initialPath;
  iframe.style.width = "1280px";
  iframe.style.height = "900px";
  document.body.appendChild(iframe);
  await waitFor(() => iframe.contentDocument?.querySelector(".app-frame"), "App shell did not render");
  iframe.contentWindow.addEventListener("error", (event) => failures.push(event.message || "iframe error"));
  iframe.contentWindow.addEventListener("unhandledrejection", (event) => failures.push(String(event.reason || "unhandled rejection")));
  return iframe.contentDocument;
}

async function assertBaseRender(doc) {
  expect(/Kovaak Tracker/.test(doc.querySelector(".app-brand")?.textContent || ""), "brand should render");
  expect(doc.querySelectorAll(".app-toolbar select").length >= 2, "benchmark and difficulty selects should render");
  expect(doc.querySelector(".daily-summary-strip"), "daily summary strip should render");
  expect(doc.querySelector(".rank-sheet-row"), "daily rank sheet rows should render");
  expect(doc.querySelector(".inspector-panel"), "inspector should render");
  expect(!(doc.body.textContent || "").includes("Internal server error"), "framework error overlay should not render");
}

async function runInteractionSmoke() {
  const doc = await mountApp();
  await assertBaseRender(doc);

  const [benchmarkSelect, difficultySelect] = [...doc.querySelectorAll(".app-toolbar select")];
  expect(benchmarkSelect.value === "Viscose Benchmarks S2", "benchmark selection should restore");
  expect(difficultySelect.value === "Easier", "difficulty selection should restore");

  const dailyDate = doc.querySelector(".toolbar-date");
  await waitFor(() => dailyDate.value === "2026-05-24", "daily review should default to latest training date");
  const previousTrainingDayButton = await waitFor(
    () => doc.querySelector(".toolbar-center .ui-icon-button[aria-label='Previous training day']"),
    "previous training day button should render",
  );
  click(previousTrainingDayButton);
  await waitFor(() => dailyDate.value === "2026-05-23", "previous training day should work");
  changeValue(dailyDate, "2026-05-24");
  await waitFor(() => /2026-05-24/.test(doc.querySelector(".daily-summary-strip")?.textContent || ""), "date change should update summary");
  await waitFor(() => /Training Time/.test(doc.querySelector(".daily-summary-strip")?.textContent || ""), "daily summary should show training time");
  await waitFor(() => /Rank Progress/.test(doc.querySelector(".daily-summary-strip")?.textContent || ""), "daily summary should show rank progress");
  await waitFor(() => /vs recent 5/.test(doc.querySelector(".daily-summary-strip")?.textContent || ""), "daily summary should show recent comparison");
  expect(doc.querySelectorAll(".weekly-focus-card").length === 5, "weekly focus should expose five focus cards");
  const rankRows = [...doc.querySelectorAll(".rank-sheet-row")];
  expect(rankRows.length > 0, "rank sheet should render rows");
  expect(
    rankRows.every((row) => row.querySelectorAll(".rank-segment-label").length >= 3),
    "each rank row should render rank threshold labels in Rank Columns",
  );
  const rankReferenceText = await waitFor(
    () => {
      const text = doc.querySelector(".rank-reference-track")?.textContent || "";
      return /bronze/i.test(text) && /silver/i.test(text) ? text : "";
    },
    "rank column header should render rank name reference",
  );
  expect(/bronze/i.test(rankReferenceText) && /silver/i.test(rankReferenceText), "rank column header should render rank name reference");
  const firstRankLabels = [...rankRows[0].querySelectorAll(".rank-segment-label")].map((label) => label.textContent || "").join(" ");
  expect(/[0-9]/.test(firstRankLabels), "rank threshold labels should include values");
  expect(!/Bronze|Silver|Gold/.test(firstRankLabels), "rank threshold labels should not repeat rank names in each row");
  const exportSheetButton = await waitFor(
    () => doc.querySelector("button[aria-label='Export rank sheet image']"),
    "rank sheet export button should render",
  );
  click(exportSheetButton);
  await waitFor(() => !/Exporting/.test(exportSheetButton.textContent || ""), "rank sheet export should finish");
  expect(!/Export failed/.test(exportSheetButton.textContent || ""), "rank sheet export should not fail");

  const fullBenchmarkButton = [...doc.querySelectorAll(".toolbar-center .ui-segmented button")].find((button) => /Full Benchmark/.test(button.textContent || ""));
  click(fullBenchmarkButton);
  await waitFor(() => storageState().dailyReviewScope === "all", "scope should persist via existing selection storage");

  const firstRow = doc.querySelector(".rank-sheet-row");
  click(firstRow);
  await waitFor(() => /VT Smoothbot/.test(doc.querySelector(".inspector-panel h2")?.textContent || ""), "row click should switch to scenario inspector");
  expect(uiPrefs().selectedDailyScenario === "VT Smoothbot", "selected daily scenario should persist in UI preferences");
  await waitFor(
    () => new URL(doc.defaultView.location.href).searchParams.get("scenario") === "VT Smoothbot",
    "row click should write scenario deep link",
  );
  expect(firstRow.parentElement?.classList.contains("floating-tooltip-anchor"), "rank threshold tooltip trigger should wrap the row for hover disclosure");
  const bestMetric = [...doc.querySelectorAll(".inspector-section .ui-segmented button")].find((button) => /Best/.test(button.textContent || ""));
  click(bestMetric);
  await waitFor(() => bestMetric.classList.contains("is-selected"), "scenario inspector metric should switch");
  expect(/Best today|Not enough recent sessions|Improving|Cooling off|Stable/.test(doc.querySelector(".trend-summary")?.textContent || ""), "scenario inspector should render trend explanation");
  const runTimeText = [...doc.querySelectorAll(".run-item small")].map((item) => item.textContent || "").join(" ");
  expect(runTimeText.includes(":"), "today runs should show run time");
  const excludeButton = [...doc.querySelectorAll(".run-item button")].find((button) => /Exclude/.test(button.textContent || ""));
  expect(excludeButton, "scenario inspector should expose exclude action");
  const detailButton = await waitFor(
    () => doc.querySelector(".inspector-panel button[aria-label='Open scenario detail']"),
    "open scenario detail button should render",
  );
  click(detailButton);
  await waitFor(() => /Scenario Detail/.test(doc.querySelector(".detail-modal")?.textContent || ""), "scenario detail modal should open");
  expect(/Rank Thresholds/.test(doc.querySelector(".detail-modal")?.textContent || ""), "detail modal should show thresholds");
  const closeDetailButton = await waitFor(
    () => doc.querySelector(".detail-modal-footer button"),
    "detail modal close button should render",
  );
  click(closeDetailButton);
  await waitFor(() => !doc.querySelector(".detail-modal"), "scenario detail modal should close");
  const stableExcludeButton = await waitFor(
    () => [...doc.querySelectorAll(".run-item button")].find((button) => /Exclude/.test(button.textContent || "")),
    "exclude action should still render after closing detail modal",
  );
  click(stableExcludeButton);
  await waitFor(
    () => Object.values(storageState().recordExclusions || {}).some((entry) => entry.status === "excluded" && entry.reason === "manual"),
    "exclude action should persist",
  );

  const backToTodayButton = await waitFor(
    () => doc.querySelector(".inspector-header button[aria-label='Back to today']"),
    "back to today button should render",
  );
  click(backToTodayButton);
  await waitFor(() => /Today/.test(doc.querySelector(".inspector-panel h2")?.textContent || ""), "back button should return to today inspector");
  await waitFor(() => !uiPrefs().selectedDailyScenario, "back button should clear persisted scenario inspector state");
  await waitFor(
    () => !new URL(doc.defaultView.location.href).searchParams.has("scenario"),
    "back button should clear scenario URL parameter",
  );
  const note = doc.querySelector(".inspector-note");
  changeValue(note, "smoke daily note");
  await waitFor(() => storageState().dailyReviews?.["2026-05-24"]?.note === "smoke daily note", "daily note should persist");
  const stateInputs = [...doc.querySelectorAll(".inspector-section input")].filter((input) => input.placeholder);
  changeValue(stateInputs[0], "medium");
  await waitFor(() => storageState().dailyReviews?.["2026-05-24"]?.state?.fatigue === "medium", "daily state fatigue should persist");
  const setupDisclosure = doc.querySelector(".inspector-disclosure");
  click(setupDisclosure);
  await waitFor(() => doc.querySelectorAll(".setup-grid input").length >= 6, "setup override should expand");
  const setupInputs = [...doc.querySelectorAll(".setup-grid input")];
  changeValue(setupInputs[3], "800");
  await waitFor(() => storageState().dailyReviews?.["2026-05-24"]?.setupOverride?.dpi === "800", "daily setup override should persist");

  const sidebarToggle = doc.querySelector(".app-toolbar .ui-icon-button");
  click(sidebarToggle);
  await waitFor(() => doc.querySelector(".app-frame").classList.contains("sidebar-collapsed"), "sidebar should collapse");
  expect(uiPrefs().sidebarCollapsed === true, "sidebar collapsed state should persist");
  const inspectorToggle = [...doc.querySelectorAll(".toolbar-right .ui-icon-button")].at(-1);
  click(inspectorToggle);
  await waitFor(() => doc.querySelector(".app-frame").classList.contains("inspector-collapsed"), "inspector should collapse");
  expect(uiPrefs().inspectorCollapsed === true, "inspector collapsed state should persist");

  click(doc.querySelector(".app-nav button[aria-label='Import / Data']"));
  await waitFor(() => (doc.querySelector(".view-heading h1")?.textContent || "").includes("Import / Data"), "import data view should render");
  await waitFor(
    () => new URL(doc.defaultView.location.href).searchParams.get("view") === "import-data",
    "import data navigation should write view URL parameter",
  );
  const form = doc.querySelector(".entry-panel form");
  const inputs = [...form.querySelectorAll("input")];
  changeValue(inputs[0], "VT Smoothbot");
  changeValue(inputs[1], "250");
  changeValue(inputs[2], "2026-05-24T10:00");
  changeValue(inputs[3], "smoke manual note");
  form.requestSubmit();
  await waitFor(() => storageState().manualRecords?.some((record) => record.note === "smoke manual note"), "manual record should persist");

  click(doc.querySelector(".app-nav button[aria-label='Records']"));
  await waitFor(() => /Records/.test(doc.querySelector(".view-heading h1")?.textContent || ""), "records view should render");
  await waitFor(
    () => new URL(doc.defaultView.location.href).searchParams.get("view") === "records",
    "records navigation should write view URL parameter",
  );
  await waitFor(() => /smoke manual note/.test(doc.body.textContent || ""), "manual record should be reachable in records view");

  click(doc.querySelector(".app-nav button[aria-label='Settings']"));
  await waitFor(() => /Settings/.test(doc.querySelector(".view-heading h1")?.textContent || ""), "settings view should render");
  await waitFor(
    () => new URL(doc.defaultView.location.href).searchParams.get("view") === "settings",
    "settings navigation should write view URL parameter",
  );
  const themeLightButton = [...doc.querySelectorAll(".settings-panel .ui-segmented button")].find((button) => /Light/.test(button.textContent || ""));
  click(themeLightButton);
  await waitFor(() => doc.querySelector(".app-frame")?.getAttribute("data-theme") === "light", "theme should be applied to app frame");
  expect(uiPrefs().theme === "light", "theme preference should persist");
  const densitySelect = doc.querySelector(".settings-panel select");
  changeValue(densitySelect, "wide");
  await waitFor(() => storageState().dailyReviewTableSettings?.density === "wide", "table density should persist from settings");
  const progressSelect = [...doc.querySelectorAll(".settings-panel select")][1];
  changeValue(progressSelect, "simple");
  await waitFor(() => storageState().dailyReviewTableSettings?.progressStyle === "simple", "simple progress style should persist from settings");
  click(doc.querySelector(".app-nav button[aria-label='Today']"));
  await waitFor(() => doc.querySelector(".daily-sheet.progress-simple"), "simple progress style should apply to the daily sheet");
  click(doc.querySelector(".app-nav button[aria-label='Settings']"));
  await waitFor(() => /Settings/.test(doc.querySelector(".view-heading h1")?.textContent || ""), "settings view should render after simple style check");
  const highContrastToggle = [...doc.querySelectorAll(".settings-toggle input")].find((input) => input.parentElement?.textContent?.includes("High contrast"));
  click(highContrastToggle);
  await waitFor(() => storageState().dailyReviewTableSettings?.highContrast === false, "table toggle should persist from settings");
  const setupFields = [...doc.querySelectorAll(".settings-form-grid input")];
  const defaultSetupDpi = setupFields.at(-3);
  changeValue(defaultSetupDpi, "1600");
  await waitFor(() => storageState().defaultSetupProfile?.dpi === "1600", "default setup profile should persist from settings");

  changeValue(difficultySelect, "Hard");
  await waitFor(() => difficultySelect.value === "Hard", "difficulty select should update");
  expect(failures.length === 0, "iframe runtime errors: " + failures.join("; "));
  pass({ manualRecords: storageState().manualRecords.length, selectedDifficulty: storageState().selectedDifficulty });
}

async function runStorageCompatibilitySmoke() {
  const doc = await mountApp();
  await assertBaseRender(doc);

  const [, difficultySelect] = [...doc.querySelectorAll(".app-toolbar select")];
  expect(difficultySelect.value === "Hard", "legacy difficulty should restore");
  expect(/VT Pasu/.test(doc.body.textContent || ""), "legacy scenario should render in the new sheet");
  const state = storageState();
  expect(state.lastBenchmarkSyncDate === seedState.lastBenchmarkSyncDate, "last sync date should remain compatible");
  expect(state.statsFolderName === "KovaaK Stats", "stats folder name should remain compatible");
  expect(state.csvRecords?.length === 1, "legacy csv records should persist");
  expect(state.manualRecords?.length === 1, "legacy manual records should persist");
  expect(state.csvRecords?.[0]?.note === "legacy csv note", "legacy csv record content should remain compatible");
  expect(state.manualRecords?.[0]?.note === "legacy manual note", "legacy manual record content should remain compatible");
  expect(failures.length === 0, "iframe runtime errors: " + failures.join("; "));
  pass({ selectedDifficulty: state.selectedDifficulty, selectedScenario: state.selectedScenario });
}

async function runUrlDeepLinkSmoke() {
  const settingsDoc = await mountApp("./index.html?view=settings");
  await waitFor(() => /Settings/.test(settingsDoc.querySelector(".view-heading h1")?.textContent || ""), "settings deep link should render settings view");
  expect(uiPrefs().activeView === "settings", "settings deep link should persist active view preference");

  const scenarioDoc = await mountApp("./index.html?scenario=VT%20Smoothbot");
  await waitFor(() => /VT Smoothbot/.test(scenarioDoc.querySelector(".inspector-panel h2")?.textContent || ""), "scenario deep link should render scenario inspector");
  expect(uiPrefs().activeView === "today", "scenario deep link should restore today view");
  expect(uiPrefs().selectedDailyScenario === "VT Smoothbot", "scenario deep link should persist selected scenario");
  expect(failures.length === 0, "iframe runtime errors: " + failures.join("; "));
  pass({ settingsView: true, scenario: uiPrefs().selectedDailyScenario });
}

(async () => {
  try {
    if (mode === "storage") await runStorageCompatibilitySmoke();
    else if (mode === "url") await runUrlDeepLinkSmoke();
    else await runInteractionSmoke();
  } catch (error) {
    fail(error);
  }
})();
</script>`;
}

function interactionSeedState() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    benchmarks: [benchmarkFixture()],
    selectedBenchmark: "Viscose Benchmarks S2",
    selectedDifficulty: "Easier",
    selectedScenario: "VT Smoothbot",
    dailyReviewDate: "",
    dailyReviewMetric: "avg",
    dailyReviewScope: "trained",
    lastBenchmarkSyncDate: today,
    statsFolderName: "",
    statsFolderUpdatedAt: "",
    csvRecords: [
      { scenario: "VT Smoothbot", rawScenario: "VT Smoothbot", score: 160, date: "2026-05-24T08:00:00.000Z", source: "csv", note: "smoke.csv" },
      { scenario: "VT Smoothbot", rawScenario: "VT Smoothbot", score: 155, date: "2026-05-23T08:00:00.000Z", source: "csv", note: "smoke-prev.csv" },
      { scenario: "VT Smoothbot Advanced", rawScenario: "VT Smoothbot Advanced", score: 175, date: "2026-05-23T08:10:00.000Z", source: "csv", note: "advanced.csv" },
      { scenario: "VT Smoothbot Advanced", rawScenario: "VT Smoothbot Advanced", score: 165, date: "2026-05-22T08:10:00.000Z", source: "csv", note: "advanced-prev.csv" },
      { scenario: "VT Pasu", rawScenario: "VT Pasu", score: 210, date: "2026-05-23T08:00:00.000Z", source: "csv", note: "hard.csv" },
    ],
    manualRecords: [],
  };
}

function legacyStorageSeedState() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    benchmarks: [benchmarkFixture()],
    selectedBenchmark: "Viscose Benchmarks S2",
    selectedDifficulty: "Hard",
    selectedScenario: "VT Pasu",
    dailyReviewDate: "2026-05-24",
    dailyReviewMetric: "best",
    dailyReviewScope: "all",
    lastBenchmarkSyncDate: today,
    statsFolderName: "KovaaK Stats",
    statsFolderUpdatedAt: "2026-05-24T00:00:00.000Z",
    csvRecords: [{ scenario: "VT Pasu", score: 220, date: "2026-05-24T09:00:00.000Z", source: "csv", note: "legacy csv note" }],
    manualRecords: [{ id: "legacy-manual-1", scenario: "VT Pasu", score: 230, date: "2026-05-24T10:00:00.000Z", source: "manual", note: "legacy manual note" }],
  };
}

function benchmarkFixture() {
  return {
    benchmarkName: "Viscose Benchmarks S2",
    difficulties: [
      {
        difficultyName: "Easier",
        sharecode: "123456",
        rankColors: { Bronze: "#a87942", Silver: "#bfc7d5", Gold: "#f4b942" },
        scenarios: [
          {
            name: "VT Smoothbot",
            category: "Tracking",
            subcategory: "Smooth",
            rankMaxes: [100, 200, 300],
          },
          {
            name: "VT Smoothbot Advanced",
            category: "Tracking",
            subcategory: "Smooth",
            rankMaxes: [100, 200, 300],
          },
        ],
        apiUpdatedAt: "2026-05-24T00:00:00.000Z",
      },
      {
        difficultyName: "Hard",
        sharecode: "789012",
        rankColors: { Bronze: "#a87942", Silver: "#bfc7d5", Gold: "#f4b942" },
        scenarios: [
          {
            name: "VT Pasu",
            category: "Click Timing",
            subcategory: "Reading",
            rankMaxes: [150, 250, 350],
          },
        ],
        apiUpdatedAt: "2026-05-24T00:00:00.000Z",
      },
    ],
  };
}
