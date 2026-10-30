import { appNavigationItems, type AppView } from "./appNavigation.ts";

export interface AppUrlState {
  selectedDailyScenario: string | null;
  view: AppView | null;
}

const validViews = new Set<AppView>(appNavigationItems.map((item) => item.view));

export function readAppUrlState(location: Location = window.location): AppUrlState {
  const params = new URLSearchParams(location.search);
  const viewParam = params.get("view");
  const scenarioParam = params.get("scenario");
  return {
    selectedDailyScenario: scenarioParam || null,
    view: isAppView(viewParam) ? viewParam : null,
  };
}

export function writeAppUrlState(state: AppUrlState, mode: "push" | "replace" = "replace"): void {
  const url = new URL(window.location.href);
  if (state.view && state.view !== "today") {
    url.searchParams.set("view", state.view);
  } else {
    url.searchParams.delete("view");
  }
  if (state.selectedDailyScenario) {
    url.searchParams.set("scenario", state.selectedDailyScenario);
  } else {
    url.searchParams.delete("scenario");
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  if (mode === "push") {
    window.history.pushState({}, "", next);
  } else {
    window.history.replaceState({}, "", next);
  }
}

function isAppView(value: string | null): value is AppView {
  return Boolean(value && validViews.has(value as AppView));
}
