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
- Tauri 2 desktop shell (Rust)
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

### Desktop app (in development)

Requires Rust (stable, MSVC) and the Visual Studio C++ build tools. Windows 11 already includes WebView2.

```powershell
npm run tauri dev
```

Or double-click `start-desktop.bat`, which uses the project-local Node.

The desktop app keeps everything in a SQLite database (`%APPDATA%\io.github.qinghaiovo.kovaaktracker\tracker.db`). It watches your stats folder and imports each run about half a second after KovaaK writes it, and it syncs rank thresholds from EVXL and KovaaK. Data saved by earlier desktop builds moves into the database by itself the first time.

Closing the window keeps the app in the system tray, still importing new runs. Click the tray icon to open the window again; its menu can also pause or resume watching the stats folder, and quit. Starting the app again while it is in the tray just brings the window back. With "打完一局后通知" on, a Windows notification shows the score, a new personal best and the rank reached whenever the window is not in front. Builds run from the project (`npm run tauri dev`, `start-desktop.bat`) show these notifications as coming from Windows PowerShell; an installed build shows its own name.

To move over from the browser version, export a backup on its Data page and import it in the desktop app (the first-run notice has a button for it, or use "导入备份" on the Data page). Runs, ignored runs, manual runs, the plan, the log, settings and followed benchmarks come along. Afterwards the app shows the backup's counts next to what it now holds. Before an import replaces anything, it saves a copy of the database in `backups\` next to `tracker.db`; the newest five copies are kept.

To try a build without touching your data, set `KOVAAK_TRACKER_DATA_DIR` to another folder before starting it.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run typecheck` | Check TypeScript types. |
| `npm run check:ts-modules` | Run core data and service checks. |
| `npm run check:fallback` | Check bundled benchmark metadata. |
| `npm run check:react-parity` | Check React data calculations and storage behavior. |
| `npm run check:csv-parity -- "<stats folder>"` | Check that the desktop importer (Rust) reads a stats folder exactly like the browser version. Needs Rust. |
| `npm run capture:ui-qa` | Capture UI screenshots. |
| `npm run build` | Build the app into `dist/`. |
| `npm run tauri dev` | Run the desktop app in development mode. |
| `npm run tauri build` | Build the desktop app and its Windows installer. |

## Layout

- `index.html`: application entry.
- `react.html`: React page entry for Vite.
- `styles.css`: shared application styles.
- `src/react/`: views, components, hooks, and UI styles.
- `src/core/`: CSV parsing, scenario matching, metrics, ranks, reviews, and storage.
- `src/services/`: file import, backups, and benchmark requests.
- `src/data/`: bundled benchmark metadata.
- `scripts/`: regression checks and screenshot capture.

## Data Sources

- [EVXL](https://evxl.app/): benchmark metadata and rank colors.
- [KovaaK](https://kovaaks.com/): benchmark scenarios and rank thresholds.
- Local KovaaK stats CSV files: training scores and setup metadata.
- Manual entries: scores, notes, training time, and setup profiles.
