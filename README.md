# Kovaak Benchmark Tracker

A local-first app for tracking KovaaK benchmark scores, ranks, and training progress.

## Features

- Sync Viscose S2 benchmark scenarios, rank colors, and score thresholds from EVXL and KovaaK.
- Import local stats CSV files and add manual score records.
- View recent averages, personal bests, rank progress, and score trends.
- Review daily sessions by scenario, category, and subcategory.
- Compare daily performance with recent sessions and review weekly training focus.
- Add daily notes, training time, sensitivity, FOV, DPI, and setup profiles.
- Exclude or restore individual runs in training metrics.
- View import summaries, failed files, and unmatched scenarios.
- Configure table appearance and export table images.
- Import and export JSON backups.

## Stack

- TypeScript and React 19
- Vite
- CSS and Lucide icons
- Canvas charts
- Browser localStorage for tracker data
- IndexedDB for stats folder handles

## Run

From the project directory:

```powershell
npm ci
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run typecheck` | Check TypeScript types. |
| `npm run check:ts-modules` | Run core data and service checks. |
| `npm run check:fallback` | Check bundled benchmark metadata. |
| `npm run check:react-parity` | Check React data calculations and storage behavior. |
| `npm run check:react-smoke` | Run browser workflow checks. |
| `npm run capture:ui-qa` | Capture UI screenshots. |
| `npm run build` | Build the app into `dist/`. |

## Layout

- `index.html`: application entry.
- `react.html`: React page entry for Vite.
- `styles.css`: shared application styles.
- `src/react/`: views, components, hooks, and UI styles.
- `src/core/`: CSV parsing, scenario matching, metrics, ranks, reviews, and storage.
- `src/services/`: file import, backups, and benchmark requests.
- `src/data/`: bundled benchmark metadata.
- `scripts/`: regression checks, browser checks, and screenshot capture.

## Data Sources

- [EVXL](https://evxl.app/): benchmark metadata and rank colors.
- [KovaaK](https://kovaaks.com/): benchmark scenarios and rank thresholds.
- Local KovaaK stats CSV files: training scores and setup metadata.
- Manual entries: scores, notes, training time, and setup profiles.
