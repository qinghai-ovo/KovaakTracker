-- Version 1: everything the app keeps.
-- Times: *_at columns are UTC milliseconds. played_local is the local time taken from the stats
-- file name ('2026-11-03T19:31:02'); it decides which training day a run belongs to.
-- Rules (scenario matching, ranks, suspicious runs) stay in TypeScript, so this schema stores
-- raw facts and the player's choices, never computed results.

-- Stats files seen by the importer: whether they were read and why one failed.
CREATE TABLE import_files (
  id          INTEGER PRIMARY KEY,
  path        TEXT NOT NULL UNIQUE,
  size        INTEGER,
  mtime       INTEGER,
  status      TEXT NOT NULL CHECK (status IN ('imported', 'failed', 'skipped')),
  error       TEXT,
  imported_at INTEGER
);

-- One row per run. Insert-only, except manual runs, which can be edited or soft-deleted.
-- identity is the dedupe key and matches recordKey() in TypeScript:
--   file runs   'csv:<file name>:<UTC ISO time>:<score>'
--   manual runs 'manual-<id>'
CREATE TABLE runs (
  id           INTEGER PRIMARY KEY,
  identity     TEXT NOT NULL UNIQUE,
  source       TEXT NOT NULL CHECK (source IN ('file', 'manual', 'legacy')),
  scenario_raw TEXT NOT NULL,
  score        REAL NOT NULL,
  played_at    INTEGER NOT NULL,
  played_local TEXT NOT NULL,
  source_file  TEXT,
  sensitivity  REAL,
  fov          REAL,
  dpi          REAL,
  note         TEXT,
  created_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX runs_scenario_time ON runs (scenario_raw, played_at);
CREATE INDEX runs_time ON runs (played_at);

-- The player's decisions about single runs, kept apart from the raw runs.
-- Keyed by identity rather than a run id so a restored backup can bring its decisions in before
-- the stats folder is imported.
CREATE TABLE run_overrides (
  identity   TEXT PRIMARY KEY,
  status     TEXT NOT NULL CHECK (status IN ('excluded', 'suspicious', 'kept')),
  reason     TEXT NOT NULL CHECK (reason IN ('zero-score', 'low-vs-median', 'manual')),
  note       TEXT,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Benchmarks synced from EVXL and KovaaK: one row per benchmark difficulty.
CREATE TABLE benchmark_difficulties (
  id         INTEGER PRIMARY KEY,
  benchmark  TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  kovaaks_id TEXT,
  sharecode  TEXT,
  synced_at  INTEGER,
  UNIQUE (benchmark, difficulty)
);

CREATE TABLE scenarios (
  id             INTEGER PRIMARY KEY,
  difficulty_id  INTEGER NOT NULL REFERENCES benchmark_difficulties (id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  category       TEXT,
  subcategory    TEXT,
  leaderboard_id TEXT,
  sort_order     INTEGER NOT NULL,
  UNIQUE (difficulty_id, name)
);

-- Score needed for each rank of a scenario (rank_index 0 = lowest rank).
CREATE TABLE thresholds (
  scenario_id INTEGER NOT NULL REFERENCES scenarios (id) ON DELETE CASCADE,
  rank_index  INTEGER NOT NULL,
  score       REAL NOT NULL,
  PRIMARY KEY (scenario_id, rank_index)
) WITHOUT ROWID;

CREATE TABLE ranks (
  difficulty_id INTEGER NOT NULL REFERENCES benchmark_difficulties (id) ON DELETE CASCADE,
  rank_index    INTEGER NOT NULL,
  name          TEXT NOT NULL,
  color         TEXT,
  PRIMARY KEY (difficulty_id, rank_index)
) WITHOUT ROWID;

-- Benchmarks the player follows, in sidebar order; exactly one is shown on every screen.
CREATE TABLE tracked_benchmarks (
  benchmark  TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  active     INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  PRIMARY KEY (benchmark, difficulty)
) WITHOUT ROWID;
CREATE UNIQUE INDEX tracked_benchmarks_one_active ON tracked_benchmarks (active) WHERE active = 1;

-- Raw scenario name in the stats files -> benchmark scenario name it counts toward.
CREATE TABLE scenario_aliases (
  raw_name      TEXT PRIMARY KEY,
  scenario_name TEXT NOT NULL,
  created_at    INTEGER NOT NULL
) WITHOUT ROWID;

-- Training log. day_key is the training day ('2026-11-03'), which starts at the configured hour.
CREATE TABLE days (
  day_key    TEXT PRIMARY KEY,
  mood       TEXT NOT NULL DEFAULT '{}',  -- JSON: { sleep, energy, warmup }
  note       TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE plans (
  day_key       TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  target_runs   INTEGER NOT NULL CHECK (target_runs > 0),
  sort_order    INTEGER NOT NULL,
  PRIMARY KEY (day_key, scenario_name)
) WITHOUT ROWID;

-- Mouse, pad and game settings. Values are kept as the player typed them.
CREATE TABLE setups (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  mouse       TEXT NOT NULL DEFAULT '',
  mousepad    TEXT NOT NULL DEFAULT '',
  sensitivity TEXT NOT NULL DEFAULT '',
  dpi         TEXT NOT NULL DEFAULT '',
  fov         TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1))
);
CREATE UNIQUE INDEX setups_one_default ON setups (is_default) WHERE is_default = 1;

-- Settings page values, one JSON value per key (e.g. 'rules.dayStartHour' -> '4').
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
