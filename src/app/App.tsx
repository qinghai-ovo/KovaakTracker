import { useMemo } from "react";
import { MapScreen } from "../screens/map/MapScreen.tsx";
import { PlaceholderScreen } from "../screens/placeholder/PlaceholderScreen.tsx";
import { TodayScreen } from "../screens/today/TodayScreen.tsx";
import { AppNav } from "./AppNav.tsx";
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
        return <PlaceholderScreen title="训练日志" phase="阶段 4" description="16 周热力图、每天的时间线、心情和笔记，会在阶段 4 接入。" />;
      case "data":
        return <PlaceholderScreen title="数据" phase="阶段 2" description="成绩记录、手动录入、未匹配场景和导入失败的文件，会在阶段 2 随 SQLite 一起接入。" />;
      case "settings":
        return <PlaceholderScreen title="设置" phase="阶段 4" description="Benchmark、成绩来源、统计规则、设备配置和外观设置，会在阶段 4 接入。" />;
      default:
        return <TodayScreen initialScenario={route.param} />;
    }
  }, [route]);

  return (
    <div className="app">
      <AppNav active={route.name} snapshot={snapshot} overall={mapView.overall} styles={styles} />
      <main className="app__main">{screen}</main>
    </div>
  );
}
