import { isTauri } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserData } from "../data/browserData.ts";
import { createFixtureData } from "../data/fixtureData.ts";
import { createTauriData } from "../data/tauriData.ts";
import "../ui/fonts.ts";
import "../ui/tokens.css";
import "../ui/ui.css";
import { App } from "./App.tsx";
import { TrackerDataProvider } from "./data.tsx";

// Real data by default; add ?demo to the address for the sample data.
// The desktop app keeps its data in SQLite and imports the stats folder in Rust; the browser keeps
// it in browser storage.
const demo = new URLSearchParams(window.location.search).has("demo");
const data = demo ? createFixtureData() : isTauri() ? createTauriData() : createBrowserData();

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <TrackerDataProvider data={data}>
      <App />
    </TrackerDataProvider>
  </StrictMode>,
);
