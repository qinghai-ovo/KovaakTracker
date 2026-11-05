/** Readable text colors for the official Viscose rank fills (fills are too light for text). */
const KNOWN_INKS: Record<string, string> = {
  "#c5c3f2": "#5B55C2",
  "#b2cbea": "#3D6A9E",
  "#baf6fc": "#0F7F8C",
  "#7bcaf0": "#1F74A6",
  "#6b94df": "#3A63BF",
  "#5558aa": "#5558AA",
  "#6e3f98": "#6E3F98",
  "#c080e4": "#9446BF",
  "#f5bde8": "#B0408F",
};

export const UNRANKED_FILL = "#E3E8F0";
export const UNRANKED_INK = "#5B6577";

function mixWithInk(hex: string, amount: number): string {
  const parse = (value: string) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  const [r, g, b] = parse(hex);
  const [ir, ig, ib] = parse("#121A2B");
  const mix = (a: number, c: number) => Math.round(a + (c - a) * amount).toString(16).padStart(2, "0");
  return `#${mix(r, ir)}${mix(g, ig)}${mix(b, ib)}`;
}

export interface RankStyle {
  name: string;
  fill: string;
  ink: string;
}

export function rankStyles(rankColors: Record<string, string>): RankStyle[] {
  return Object.entries(rankColors).map(([name, fill]) => ({
    name,
    fill,
    ink: KNOWN_INKS[fill.toLowerCase()] ?? mixWithInk(fill, 0.45),
  }));
}

export function rankStyleAt(styles: RankStyle[], index: number): RankStyle {
  return index >= 0 && styles[index] ? styles[index] : { name: "未定级", fill: UNRANKED_FILL, ink: UNRANKED_INK };
}

/** Hex color with an alpha suffix, e.g. track backgrounds. */
export function withAlpha(hex: string, alpha: number): string {
  return hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
}
