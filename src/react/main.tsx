import React from "react";
import { createRoot } from "react-dom/client";
import "../../styles.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/controls.css";
import "./styles/app-shell.css";
import "./styles/daily-review.css";
import "./styles/inspector.css";
import "./styles/tables.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
