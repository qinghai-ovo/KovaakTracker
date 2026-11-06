import { isTauri } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserData } from "../data/browserData.ts";
import { createFixtureData } from "../data/fixtureData.ts";
import "../ui/fonts.ts";
import "../ui/tokens.css";
import "../ui/ui.css";
import { App } from "./App.tsx";
import { TrackerDataProvider } from "./data.tsx";

// In the browser: real data saved by the classic app; add ?demo to the address for the sample data.
// In the desktop app: sample data until the Tauri data source lands (roadmap M2d).
const demo = isTauri() || new URLSearchParams(window.location.search).has("demo");
const data = demo ? createFixtureData() : createBrowserData();

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <TrackerDataProvider data={data}>
      <App />
    </TrackerDataProvider>
  </StrictMode>,
);
