#!/usr/bin/env node

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
const outputDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), "kovaak-ui-qa"));

const cases = [
  { name: "wide-desktop", width: 1440, height: 980, prefs: {} },
  { name: "medium-window", width: 1100, height: 900, prefs: {} },
  { name: "sidebar-collapsed", width: 1280, height: 900, prefs: { sidebarCollapsed: true } },
  { name: "inspector-collapsed", width: 1280, height: 900, prefs: { inspectorCollapsed: true } },
  { name: "scenario-selected", width: 1280, height: 900, prefs: { selectedDailyScenario: "VT Smoothbot" } },
  { name: "detail-modal", width: 1280, height: 900, openDetailModal: true, prefs: { selectedDailyScenario: "VT Smoothbot" } },
  { name: "light-theme", width: 1440, height: 980, prefs: { theme: "light" } },
];

await assertBuildExists(path.join(distDir, "react.html"), "dist/react.html");
await fs.mkdir(outputDir, { recursive: true });

const browserPath = await findBrowser();
const server = await startStaticServer();

try {
  for (const qaCase of cases) {
    const outputPath = path.join(outputDir, `${qaCase.name}.png`);
    await captureCase(browserPath, server.origin, qaCase, outputPath);
    console.log(`${qaCase.name}: ${outputPath}`);
  }
} finally {
  await new Promise((resolve) => server.instance.close(resolve));
}

async function captureCase(browserPath, origin, qaCase, outputPath) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), `kovaak-ui-qa-${qaCase.name}-`));
  try {
    await runBrowser(browserPath, [
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
      `--window-size=${qaCase.width},${qaCase.height}`,
      "--virtual-time-budget=7000",
      `--screenshot=${outputPath}`,
      `${origin}/__ui-qa.html?case=${encodeURIComponent(qaCase.name)}`,
    ]);
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function assertBuildExists(filePath, label) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${label} not found. Run npm run build before npm run capture:ui-qa.`);
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
      // Keep looking.
    }
  }
  throw new Error("Chrome or Edge was not found. Set CHROME_PATH or EDGE_PATH to capture UI QA screenshots.");
}

function runBrowser(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`UI QA screenshot timed out\n${stderr}`));
    }, 60_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`UI QA screenshot exited with ${code}\n${stderr}`));
    });
  });
}

async function startStaticServer() {
  const port = await findFreePort();
  const instance = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
      if (url.pathname === "/__ui-qa.html") {
        const qaCase = cases.find((item) => item.name === url.searchParams.get("case")) || cases[0];
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(qaRunnerHtml(qaCase));
        return;
      }
      const relativePath = decodeURIComponent(url.pathname === "/" ? "/react.html" : url.pathname);
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
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function qaRunnerHtml(qaCase) {
  const prefs = {
    activeView: "today",
    inspectorCollapsed: false,
    selectedDailyScenario: null,
    sidebarCollapsed: false,
    theme: "dark",
    ...qaCase.prefs,
  };
  return `<!doctype html>
<meta charset="utf-8">
<title>UI QA ${qaCase.name}</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; background: #0f1115; overflow: hidden; }
  iframe { border: 0; width: 100vw; height: 100vh; display: block; }
</style>
<script>
  localStorage.clear();
  localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(seedState()))});
  localStorage.setItem(${JSON.stringify(uiPrefsKey)}, ${JSON.stringify(JSON.stringify(prefs))});
  const openDetailModal = ${JSON.stringify(Boolean(qaCase.openDetailModal))};
  if (openDetailModal) {
    window.addEventListener("load", () => {
      const iframe = document.querySelector("iframe");
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const button = iframe?.contentDocument?.querySelector("button[aria-label='Open scenario detail']");
        if (button) {
          button.click();
          clearInterval(timer);
        }
        if (Date.now() - startedAt > 5000) clearInterval(timer);
      }, 100);
    });
  }
</script>
<iframe src="./react.html"></iframe>`;
}

function seedState() {
  return {
    benchmarks: [benchmarkFixture()],
    selectedBenchmark: "Viscose Benchmarks S2",
    selectedDifficulty: "Easier",
    selectedScenario: "VT Smoothbot",
    dailyReviewDate: "",
    dailyReviewMetric: "avg",
    dailyReviewScope: "all",
    csvRecords: [
      { scenario: "VT Smoothbot", rawScenario: "VT Smoothbot", score: 160, date: "2026-05-24T08:00:00.000Z", source: "csv", note: "qa.csv" },
      { scenario: "VT Smoothbot", rawScenario: "VT Smoothbot", score: 155, date: "2026-05-23T08:00:00.000Z", source: "csv", note: "qa-prev.csv" },
      { scenario: "VT Smoothbot Advanced", rawScenario: "VT Smoothbot Advanced", score: 175, date: "2026-05-24T08:10:00.000Z", source: "csv", note: "advanced.csv" },
      { scenario: "VT Smoothbot Advanced", rawScenario: "VT Smoothbot Advanced", score: 165, date: "2026-05-22T08:10:00.000Z", source: "csv", note: "advanced-prev.csv" },
      { scenario: "VT Pasu", rawScenario: "VT Pasu", score: 210, date: "2026-05-24T08:20:00.000Z", source: "csv", note: "pasu.csv" },
    ],
    manualRecords: [],
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
          { name: "VT Smoothbot", category: "Tracking", subcategory: "Smooth", rankMaxes: [100, 200, 300] },
          { name: "VT Smoothbot Advanced", category: "Tracking", subcategory: "Smooth", rankMaxes: [100, 200, 300] },
          { name: "VT Pasu", category: "Click Timing", subcategory: "Dynamic", rankMaxes: [150, 250, 350] },
        ],
      },
    ],
  };
}
