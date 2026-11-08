//! Developer tool for checking the Rust importer against a real stats folder.
//!
//!   cargo run --release --example parse_stats -- parse <stats dir>
//!     One JSON line per CSV file: what the Rust parser read from it.
//!     scripts/compare-csv-parsers.mjs compares this with the TypeScript parser.
//!
//!   cargo run --release --example parse_stats -- import <stats dir> <new database file>
//!     A full first import into a fresh database, timed.

use std::{fs, path::Path, sync::Mutex, time::Instant, time::UNIX_EPOCH};

use kovaak_tracker_lib::{
    db::Db,
    importer::{
        parser::parse_kovaak_csv,
        pipeline::{ScanOptions, import_folder},
    },
};
use serde_json::json;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["parse", dir] => parse(Path::new(dir)),
        ["import", dir, db] => import(Path::new(dir), Path::new(db)),
        _ => {
            eprintln!(
                "usage: parse_stats parse <stats dir> | import <stats dir> <new database file>"
            );
            std::process::exit(2);
        }
    }
}

fn parse(dir: &Path) {
    let mut names: Vec<_> = fs::read_dir(dir)
        .expect("read the stats folder")
        .flatten()
        .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
        .filter(|name| name.to_ascii_lowercase().ends_with(".csv"))
        .collect();
    names.sort();
    for name in names {
        let path = dir.join(&name);
        let mtime = fs::metadata(&path)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|since| since.as_millis() as i64);
        let text =
            String::from_utf8_lossy(&fs::read(&path).expect("read a stats file")).into_owned();
        let line = match parse_kovaak_csv(&text, &name, mtime) {
            Ok(run) => json!({
                "file": name,
                "identity": run.identity,
                "scenario": run.scenario,
                "score": run.score,
                "playedAt": run.played_at,
                "playedLocal": run.played_local,
                "sensitivity": run.sensitivity,
                "fov": run.fov,
                "dpi": run.dpi,
            }),
            Err(failure) => json!({ "file": name, "failure": failure.code() }),
        };
        println!("{line}");
    }
}

fn import(dir: &Path, db_path: &Path) {
    assert!(
        !db_path.exists(),
        "{} already exists; give a new file",
        db_path.display()
    );
    let db = Mutex::new(Db::open(db_path).expect("open the database"));
    let started = Instant::now();
    let summary = import_folder(&db, dir, ScanOptions::default(), 0, |done, total| {
        eprintln!(
            "{done}/{total} files, {:.1}s",
            started.elapsed().as_secs_f64()
        );
    })
    .expect("import the folder");
    println!(
        "first import: {} files, {} runs, {} failed in {:.2}s",
        summary.read,
        summary.added,
        summary.failed.len(),
        started.elapsed().as_secs_f64()
    );
    let started = Instant::now();
    let again =
        import_folder(&db, dir, ScanOptions::default(), 0, |_, _| {}).expect("import again");
    println!(
        "second pass: read {} files, {} new runs in {:.2}s",
        again.read,
        again.added,
        started.elapsed().as_secs_f64()
    );
}
