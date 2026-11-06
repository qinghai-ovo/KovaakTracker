import { isTauri } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserData } from "../data/browserData.ts";
import { createDesktopData } from "../data/desktopData.ts";
import { createFixtureData } from "../data/fixtureData.ts";
import "../ui/fonts.ts";
import "../ui/tokens.css";
import "../ui/ui.css";
import { App } from "./App.tsx";
import { TrackerDataProvider } from "./data.tsx";

// Real data by default; add ?demo to the address for the sample data.
// The desktop app reads the stats folder through Rust and syncs thresholds over tauri-plugin-http,
// keeping its data in the webview's own storage until the SQLite data source lands (roadmap M2d).
const demo = new URLSearchParams(window.location.search).has("demo");
const data = demo ? createFixtureData() : isTauri() ? createDesktopData() : createBrowserData();

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <TrackerDataProvider data={data}>
      <App />
    </TrackerDataProvider>
  </StrictMode>,
);
