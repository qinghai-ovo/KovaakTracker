import { useEffect, useRef } from "react";
import { daysBetween } from "../../core/stats.ts";
import type { ScoreRecord } from "../../core/types.ts";
import { average } from "../../core/stats.ts";
import { formatNumber, shortDate } from "../format.ts";

type ChartRange = "month" | "week" | "recent10";

interface ChartCanvasProps {
  range: ChartRange;
  rankNames: string[];
  records: ScoreRecord[];
  thresholds: number[];
  onSelectRange: (range: ChartRange) => void;
}

export function ChartCanvas({ onSelectRange, range, rankNames, records, thresholds }: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const draw = () => renderChart({
      canvas,
      context,
      devicePixelRatio: window.devicePixelRatio || 1,
      range,
      rankNames,
      records,
      thresholds,
    });
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [range, rankNames, records, thresholds]);

  return (
    <section className="panel chart-panel">
      <div className="panel-heading chart-heading">
        <div>
          <h2>趋势图</h2>
          <p className="muted">当前筛选记录与段位线参考</p>
        </div>
        <div className="segmented">
          <button className={`range-btn${range === "month" ? " active" : ""}`} type="button" onClick={() => onSelectRange("month")}>
            1 月
          </button>
          <button className={`range-btn${range === "week" ? " active" : ""}`} type="button" onClick={() => onSelectRange("week")}>
            7 天
          </button>
          <button className={`range-btn${range === "recent10" ? " active" : ""}`} type="button" onClick={() => onSelectRange("recent10")}>
            10 次
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} />
    </section>
  );
}

function filterChartPoints(records: ScoreRecord[], range: ChartRange, now = new Date()): ScoreRecord[] {
  let points = [...records].reverse();
  if (range === "month") points = points.filter((record) => daysBetween(new Date(record.date), now) <= 30);
  if (range === "week") points = points.filter((record) => daysBetween(new Date(record.date), now) <= 7);
  if (range === "recent10") points = points.slice(-10);
  return points;
}

function renderChart({
  canvas,
  context,
  devicePixelRatio,
  range,
  rankNames,
  records,
  thresholds,
}: {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  devicePixelRatio: number;
  range: ChartRange;
  rankNames: string[];
  records: ScoreRecord[];
  thresholds: number[];
}) {
  const rect = canvas.getBoundingClientRect();
  const scale = devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * scale));
  canvas.height = Math.max(260, Math.floor(rect.height * scale));
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const width = rect.width;
  const height = rect.height;
  context.clearRect(0, 0, width, height);
  drawChartFrame(context, width, height);

  const points = filterChartPoints(records, range);
  if (!points.length) {
    context.fillStyle = "#9daab3";
    context.font = "15px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.fillText("读取成绩后显示趋势", width / 2, height / 2);
    return;
  }

  const padding = { top: 26, right: 24, bottom: 42, left: 64 };
  const scores = points.map((record) => record.score);
  const values = [...scores, ...thresholds];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(max * 0.08, 1);
  const yMin = Math.max(0, min - spread * 0.18);
  const yMax = max + spread * 0.18;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const coords = points.map((record, index) => ({
    x: padding.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
    y: padding.top + (1 - (record.score - yMin) / (yMax - yMin)) * plotHeight,
    record,
  }));

  drawYAxis(context, padding, width, plotHeight, yMin, yMax);
  drawRankLines(context, thresholds, rankNames, padding, width, plotHeight, yMin, yMax);
  drawLine(context, coords, "#4cc9a5", 3);
  drawMovingAverage(context, coords, points, padding, plotHeight, yMin, yMax);
  drawPoints(context, coords);
  drawXAxis(context, coords, height, padding);
}

function drawChartFrame(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#1b2024";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#303942";
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
}

function drawYAxis(
  context: CanvasRenderingContext2D,
  padding: { top: number; right: number; bottom: number; left: number },
  width: number,
  plotHeight: number,
  yMin: number,
  yMax: number,
) {
  context.font = "12px Segoe UI, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const value = yMax - (yMax - yMin) * ratio;
    const y = padding.top + plotHeight * ratio;
    context.strokeStyle = "rgba(157, 170, 179, 0.15)";
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = "#9daab3";
    context.fillText(formatNumber(value), padding.left - 10, y);
  }
}

function drawRankLines(
  context: CanvasRenderingContext2D,
  thresholds: number[],
  rankNames: string[],
  padding: { top: number; right: number; bottom: number; left: number },
  width: number,
  plotHeight: number,
  yMin: number,
  yMax: number,
) {
  thresholds.forEach((threshold, index) => {
    const y = padding.top + (1 - (threshold - yMin) / (yMax - yMin)) * plotHeight;
    if (y < padding.top || y > padding.top + plotHeight) return;
    context.strokeStyle = "rgba(244, 185, 66, 0.28)";
    context.setLineDash([5, 5]);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#f4b942";
    context.font = "11px Segoe UI, sans-serif";
    context.textAlign = "left";
    context.fillText(rankNames[index] || "", padding.left + 6, y - 7);
  });
}

function drawLine(context: CanvasRenderingContext2D, coords: Array<{ x: number; y: number }>, color: string, lineWidth: number) {
  if (coords.length < 2) return;
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  coords.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
  context.stroke();
}

function drawMovingAverage(
  context: CanvasRenderingContext2D,
  coords: Array<{ x: number; y: number }>,
  points: ScoreRecord[],
  padding: { top: number; right: number; bottom: number; left: number },
  plotHeight: number,
  yMin: number,
  yMax: number,
) {
  if (points.length < 4) return;
  const moving = points.map((_, index) => average(points.slice(Math.max(0, index - 4), index + 1).map((record) => record.score)));
  const avgCoords = coords.map((point, index) => ({
    x: point.x,
    y: padding.top + (1 - (Number(moving[index]) - yMin) / (yMax - yMin)) * plotHeight,
  }));
  drawLine(context, avgCoords, "#f4b942", 2);
}

function drawPoints(context: CanvasRenderingContext2D, coords: Array<{ x: number; y: number }>) {
  coords.forEach((point) => {
    context.fillStyle = "#121416";
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#4cc9a5";
    context.lineWidth = 2;
    context.stroke();
  });
}

function drawXAxis(
  context: CanvasRenderingContext2D,
  coords: Array<{ x: number; y: number; record: ScoreRecord }>,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
) {
  context.fillStyle = "#9daab3";
  context.font = "12px Segoe UI, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "top";
  coords
    .filter((_, index) => coords.length <= 6 || index === 0 || index === coords.length - 1 || index % Math.ceil(coords.length / 5) === 0)
    .forEach((point) => context.fillText(shortDate(point.record.date), point.x, height - padding.bottom + 15));
}
