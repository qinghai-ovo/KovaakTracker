//! Reads KovaaK stats CSV files for the web UI until the Rust import pipeline lands (roadmap M2c).
//!
//! The page passes the folder the user picked plus a bare file name; only `.csv` files directly
//! inside that folder can be read.

use std::fs;
use std::path::{Path, PathBuf};

fn is_csv(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".csv")
}

/// A bare `*.csv` file name: no separators, no `..`, nothing that could leave the folder.
fn is_plain_csv_name(name: &str) -> bool {
    is_csv(name)
        && !name.contains(['/', '\\', ':'])
        && name != ".."
        && Path::new(name).file_name().and_then(|n| n.to_str()) == Some(name)
}

/// Names of the `.csv` files directly inside `dir`.
pub fn list_csv_names(dir: &Path) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取文件夹失败：{e}"))?;
    let names = entries
        .flatten()
        .filter(|entry| entry.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
        .filter(|name| is_csv(name))
        .collect();
    Ok(names)
}

/// The text of one CSV in `dir`; invalid UTF-8 is replaced, like the browser's `File.text()`.
pub fn read_csv(dir: &Path, name: &str) -> Result<String, String> {
    if !is_plain_csv_name(name) {
        return Err(format!("不是 stats 文件夹里的 CSV 文件：{name}"));
    }
    let path: PathBuf = dir.join(name);
    let bytes = fs::read(&path).map_err(|e| format!("读取 {name} 失败：{e}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
pub fn list_stats_files(dir: String) -> Result<Vec<String>, String> {
    list_csv_names(Path::new(&dir))
}

#[tauri::command]
pub fn read_stats_file(dir: String, name: String) -> Result<String, String> {
    read_csv(Path::new(&dir), &name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("kovaak-stats-test-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_only_csv_files_in_the_folder() {
        let dir = temp_dir("list");
        fs::write(
            dir.join("A - Challenge - 2026.11.05-20.00.00 Stats.csv"),
            "x",
        )
        .unwrap();
        fs::write(dir.join("B.CSV"), "x").unwrap();
        fs::write(dir.join("notes.txt"), "x").unwrap();
        fs::create_dir(dir.join("nested.csv")).unwrap();
        let mut names = list_csv_names(&dir).unwrap();
        names.sort();
        assert_eq!(
            names,
            vec!["A - Challenge - 2026.11.05-20.00.00 Stats.csv", "B.CSV"]
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reads_csv_text_and_replaces_invalid_utf8() {
        let dir = temp_dir("read");
        fs::write(dir.join("ok.csv"), b"Score:,2740\n\xff").unwrap();
        assert_eq!(read_csv(&dir, "ok.csv").unwrap(), "Score:,2740\n\u{fffd}");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_names_that_leave_the_folder_or_are_not_csv() {
        let dir = temp_dir("refuse");
        for name in [
            "../secret.csv",
            "..\\secret.csv",
            "sub/a.csv",
            "C:secret.csv",
            "notes.txt",
            "..",
        ] {
            assert!(read_csv(&dir, name).is_err(), "{name} should be refused");
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
