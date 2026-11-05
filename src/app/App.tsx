import { useMemo } from "react";
import { DataScreen } from "../screens/data/DataScreen.tsx";
import { JournalScreen } from "../screens/journal/JournalScreen.tsx";
import { MapScreen } from "../screens/map/MapScreen.tsx";
import { SettingsScreen } from "../screens/settings/SettingsScreen.tsx";
import { TodayScreen } from "../screens/today/TodayScreen.tsx";
import { AppNav } from "./AppNav.tsx";
import { DataNotice } from "./DataNotice.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { useMapView, useRankStyles, useScreenInput, useSnapshot } from "./data.tsx";
import { useRoute } from "./router.ts";

export function App() {
  const route = useRoute();
  const snapshot = useSnapshot();
  const input = useScreenInput(snapshot);
  const styles = useRankStyles(snapshot);
  const mapView = useMapView(input);

  const screen = useMemo(() => {
    switch (route.name) {
      case "map":
        return <MapScreen selectedName={route.param} />;
      case "journal":
        return <JournalScreen dayParam={route.param} />;
      case "data":
        return <DataScreen />;
      case "settings":
        return <SettingsScreen />;
      default:
        return <TodayScreen initialScenario={route.param} />;
    }
  }, [route]);

  return (
    <div className={snapshot.preferences.showInRank ? "app" : "app hide-in-rank"}>
      <AppNav active={route.name} snapshot={snapshot} overall={mapView.overall} styles={styles} />
      <main className="app__main">
        <DataNotice snapshot={snapshot} />
        <ErrorBoundary resetKey={`${route.name}/${route.param ?? ""}`}>{screen}</ErrorBoundary>
      </main>
    </div>
  );
}
