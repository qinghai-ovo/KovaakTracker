import type { Benchmark } from "../core/types.ts";

export const benchmarkFallback: Benchmark[] = [
  {
    benchmarkName: "Viscose Benchmarks S2",
    difficulties: [
      {
        difficultyName: "Easier",
        kovaaksBenchmarkId: 2335,
        sharecode: "KovaaKsScreamingPulledEgg",
        rankColors: {
          Lemming: "#C5C3F2",
          Hare: "#B2CBEA",
          Ermine: "#BAF6FC",
          Puffin: "#7bcaf0",
          Penguin: "#6B94DF",
          Fox: "#5558AA",
          Mammoth: "#6E3F98",
          Orca: "#C080E4",
          Seal: "#F5BDE8",
        },
      },
      {
        difficultyName: "Medium",
        kovaaksBenchmarkId: 2336,
        sharecode: "KovaaKsPeakingNarrowImpact",
        rankColors: {
          Cinnabar: "#A71112",
          Vermillion: "#F85939",
          Saffron: "#F1C338",
          Celadon: "#9CFF91",
          Viridian: "#368b5c",
          Cerulean: "#02A4D3",
          Lavender: "#C2C2FF",
          Indigo: "#5C3896",
          Fuchsia: "#C74375",
        },
      },
      {
        difficultyName: "Hard",
        kovaaksBenchmarkId: 2337,
        sharecode: "KovaaKsPlunderingOlivegreenClutch",
        rankColors: {
          Wool: "#F1ECEB",
          Rayon: "#F1ECEB",
          Linen: "#EED3CE",
          Velvet: "#ECA1B0",
          Chiffon: "#8FC7E7",
          Tricot: "#5CA9C6",
          Satin: "#5CA9C6",
          Silk: "#2E6F8A",
        },
      },
      {
        difficultyName: "Expert",
        kovaaksBenchmarkId: 2338,
        sharecode: "KovaaKsRaidingPeriwinkleWindow",
        rankColors: {
          Interloper: "#f8c9f8",
          Attuned: "#ef92ef",
          Heroic: "#e967e9",
          Mythic: "#cc91f0",
          Ascension: "#b966ea",
          Eclipse: "#62148f",
        },
      },
    ],
  },
];
