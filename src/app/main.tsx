import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserData } from "../data/browserData.ts";
import { createFixtureData } from "../data/fixtureData.ts";
import "../ui/tokens.css";
import "../ui/ui.css";
import { App } from "./App.tsx";
import { TrackerDataProvider } from "./data.tsx";

// Real data saved by the classic app in this browser; add ?demo to the address for the sample data.
// The Tauri backend replaces the browser source in phase 1.
const demo = new URLSearchParams(window.location.search).has("demo");
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
