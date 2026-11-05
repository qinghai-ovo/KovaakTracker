import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createFixtureData } from "../data/fixtureData.ts";
import "../ui/tokens.css";
import "../ui/ui.css";
import { App } from "./App.tsx";
import { TrackerDataProvider } from "./data.tsx";

// Until the Tauri backend exists (phase 1), the new UI runs on the in-memory sample data.
const data = createFixtureData();

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <TrackerDataProvider data={data}>
      <App />
    </TrackerDataProvider>
  </StrictMode>,
);
