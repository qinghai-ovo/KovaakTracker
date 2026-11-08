//! KovaaK stats CSV → one run.
//!
//! Ported from `src/services/csv.ts`, including its quirks, so a run gets the same identity in
//! Rust as in the browser and exclusions saved there still apply. Keep the two in step:
//! `scripts/compare-csv-parsers.mjs` checks them against a real stats folder.
//!
//! One deliberate difference: a missing sensitivity / FOV / DPI is `None` here, where the
//! TypeScript parser turns an empty value into 0.

use std::{collections::HashMap, sync::LazyLock};

use chrono::{
    DateTime, Duration, Local, LocalResult, Months, NaiveDate, NaiveDateTime, TimeZone, Utc,
};
use regex::Regex;

const SCENARIO_FIELDS: &[&str] = &[
    "scenario",
    "scenario name",
    "challenge",
    "challenge name",
    "map",
    "name",
];
const SCORE_FIELDS: &[&str] = &["score", "final score", "challenge score", "score (final)"];
const DATE_FIELDS: &[&str] = &[
    "challenge start",
    "challenge start time",
    "date",
    "time",
    "timestamp",
];
const SENS_FIELDS: &[&str] = &["sensitivity", "sens"];
const FOV_FIELDS: &[&str] = &["fov", "field of view"];
const DPI_FIELDS: &[&str] = &["dpi", "mouse dpi"];

/// `2026.11.03-19.31.02` in a stats file name (ASCII digits, like JavaScript's `\d`).
const DATE_PATTERN: &str =
    r"[0-9]{4}[.-][0-9]{1,2}[.-][0-9]{1,2}-[0-9]{1,2}[.-][0-9]{1,2}[.-][0-9]{1,2}";

static FILE_NAME_DATE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"([0-9]{4})[.-]([0-9]{1,2})[.-]([0-9]{1,2})-([0-9]{1,2})[.-]([0-9]{1,2})[.-]([0-9]{1,2})",
    )
    .unwrap()
});
static CHALLENGE_DATE_STATS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"(?i)\s+-\s+Challenge\s+-\s+{DATE_PATTERN}\s+Stats$"
    ))
    .unwrap()
});
static DATE_STATS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(&format!(r"(?i)\s+-\s+{DATE_PATTERN}\s+Stats$")).unwrap());
static CHALLENGE_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\s+-\s+Challenge$").unwrap());

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedRun {
    /// Dedupe key, identical to the record id the TypeScript parser makes.
    pub identity: String,
    /// Scenario name as written in the file, whitespace tidied.
    pub scenario: String,
    pub score: f64,
    /// UTC milliseconds.
    pub played_at: i64,
    /// Local time, e.g. `2026-11-03T19:31:02`.
    pub played_local: String,
    pub date_source: DateSource,
    pub sensitivity: Option<f64>,
    pub fov: Option<f64>,
    pub dpi: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateSource {
    FileName,
    Csv,
    /// The file's modified time, or now.
    Fallback,
}

/// Why a file gave no run; the codes match `CsvImportStatus.failureReason` in TypeScript.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParseFailure {
    Empty,
    MissingScenario,
    MissingScore,
}

impl ParseFailure {
    pub fn code(self) -> &'static str {
        match self {
            ParseFailure::Empty => "empty",
            ParseFailure::MissingScenario => "missing-scenario",
            ParseFailure::MissingScore => "missing-score",
        }
    }
}

/// Field name → value. `None` is a header column the chosen row has no cell for.
type Lookup = HashMap<String, Option<String>>;

/// Reads one stats file. `modified_ms` dates the run only when neither the file name nor the
/// CSV has a usable date.
pub fn parse_kovaak_csv(
    text: &str,
    file_name: &str,
    modified_ms: Option<i64>,
) -> Result<ParsedRun, ParseFailure> {
    // The browser's File.text() drops a UTF-8 byte order mark; do the same.
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let rows: Vec<Vec<String>> = split_csv(text)
        .into_iter()
        .filter(|row| row.iter().any(|cell| !js_trim(cell).is_empty()))
        .collect();
    if rows.is_empty() {
        return Err(ParseFailure::Empty);
    }

    let header_index = rows.iter().position(|row| {
        row_contains_field(row, SCORE_FIELDS) && row_contains_field(row, SCENARIO_FIELDS)
    });
    let (header, data_rows) = match header_index {
        Some(index) => (&rows[index], &rows[index + 1..]),
        None => (&rows[0], &rows[1..]),
    };
    let row = data_rows
        .iter()
        .find(|row| row.iter().any(|cell| js_number(cell).is_finite()))
        .or(data_rows.first())
        .unwrap_or(header);
    let by_header = header_lookup(header, row);
    let by_key = key_value_lookup(&rows);
    let field = |names: &[&str]| pick(&by_header, names).or_else(|| pick(&by_key, names));

    let scenario = match field(SCENARIO_FIELDS) {
        Some(name) => normalize_scenario_name(name),
        None => scenario_from_file_name(file_name),
    };
    let score = js_number(field(SCORE_FIELDS).unwrap_or(""));
    if scenario.is_empty() {
        return Err(ParseFailure::MissingScenario);
    }
    if !score.is_finite() {
        return Err(ParseFailure::MissingScore);
    }

    let (played_at, played_local, date_source) = if let Some(local) = date_from_file_name(file_name)
    {
        (local_to_utc(local), local, DateSource::FileName)
    } else if let Some(utc) = field(DATE_FIELDS).and_then(parse_js_date) {
        (
            utc,
            utc.with_timezone(&Local).naive_local(),
            DateSource::Csv,
        )
    } else {
        let utc = modified_ms
            .and_then(|ms| Utc.timestamp_millis_opt(ms).single())
            .unwrap_or_else(Utc::now);
        (
            utc,
            utc.with_timezone(&Local).naive_local(),
            DateSource::Fallback,
        )
    };
    // JavaScript dates keep whole milliseconds.
    let played_at_ms = played_at.timestamp_millis();
    let iso = Utc
        .timestamp_millis_opt(played_at_ms)
        .single()
        .unwrap_or(played_at)
        .format("%Y-%m-%dT%H:%M:%S%.3fZ");

    let metadata = |names: &[&str]| {
        field(names)
            .map(js_number)
            .filter(|value| value.is_finite())
    };
    Ok(ParsedRun {
        identity: format!("csv:{file_name}:{iso}:{}", js_number_string(score)),
        scenario,
        score,
        played_at: played_at_ms,
        played_local: played_local.format("%Y-%m-%dT%H:%M:%S").to_string(),
        date_source,
        sensitivity: metadata(SENS_FIELDS),
        fov: metadata(FOV_FIELDS),
        dpi: metadata(DPI_FIELDS),
    })
}

/// Splits CSV text into rows of cells. Quotes toggle anywhere in a cell and `""` inside quotes
/// is a literal quote, exactly like `parseCsv` in TypeScript.
fn split_csv(text: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut cell = String::new();
    let mut quoted = false;
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cell.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => row.push(std::mem::take(&mut cell)),
            '\n' | '\r' if !quoted => {
                if ch == '\r' && chars.peek() == Some(&'\n') {
                    chars.next();
                }
                row.push(std::mem::take(&mut cell));
                rows.push(std::mem::take(&mut row));
            }
            _ => cell.push(ch),
        }
    }
    row.push(cell);
    rows.push(row);
    rows
}

fn header_lookup(header: &[String], row: &[String]) -> Lookup {
    header
        .iter()
        .enumerate()
        .map(|(index, name)| (normalize_field_name(name), row.get(index).cloned()))
        .collect()
}

/// `Score:,9459.0` style rows: first cell is the name, second the value. Later rows win.
fn key_value_lookup(rows: &[Vec<String>]) -> Lookup {
    let mut lookup = Lookup::new();
    for row in rows.iter().filter(|row| row.len() >= 2) {
        let key = normalize_field_name(&row[0]);
        if !key.is_empty() {
            lookup.insert(key, Some(row[1].clone()));
        }
    }
    lookup
}

/// The first of `names` with a non-blank value, untrimmed.
fn pick<'a>(lookup: &'a Lookup, names: &[&str]) -> Option<&'a str> {
    names.iter().find_map(|name| match lookup.get(*name) {
        Some(Some(value)) if !js_trim(value).is_empty() => Some(value.as_str()),
        _ => None,
    })
}

fn row_contains_field(row: &[String], names: &[&str]) -> bool {
    row.iter()
        .any(|cell| names.contains(&normalize_field_name(cell).as_str()))
}

/// `"Score: "` → `"score:"`, `"Horiz  Sens:"` → `"horiz sens"`: one trailing colon dropped,
/// whitespace collapsed, trimmed, lower-cased (in that order, as in TypeScript).
fn normalize_field_name(value: &str) -> String {
    let value = value.strip_suffix(':').unwrap_or(value);
    js_trim(&collapse_whitespace(value)).to_lowercase()
}

fn normalize_scenario_name(value: &str) -> String {
    js_trim(&collapse_whitespace(value)).to_string()
}

/// Scenario name from `VT_Pasu - Challenge - 2026.11.03-19.31.02 Stats.csv`.
fn scenario_from_file_name(file_name: &str) -> String {
    let name = normalize_scenario_name(&file_name.replace('_', " "));
    let name = match name.len().checked_sub(4) {
        Some(cut) if name.is_char_boundary(cut) && name[cut..].eq_ignore_ascii_case(".csv") => {
            &name[..cut]
        }
        _ => name.as_str(),
    };
    let name = CHALLENGE_DATE_STATS.replace(name, "");
    let name = DATE_STATS.replace(&name, "");
    let name = CHALLENGE_SUFFIX.replace(&name, "");
    js_trim(&name).to_string()
}

/// Every run of whitespace becomes one space (JavaScript's `/\s+/g`).
fn collapse_whitespace(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_space = false;
    for ch in value.chars() {
        if is_js_space(ch) {
            if !in_space {
                out.push(' ');
            }
            in_space = true;
        } else {
            out.push(ch);
            in_space = false;
        }
    }
    out
}

/// JavaScript's whitespace, which also counts the byte order mark.
fn is_js_space(ch: char) -> bool {
    ch.is_whitespace() || ch == '\u{feff}'
}

fn js_trim(value: &str) -> &str {
    value.trim_matches(is_js_space)
}

/// `Number(text.replace(/,/g, "").trim())`: blank is 0, `0x` / `0o` / `0b` prefixes and
/// `Infinity` are understood, anything else that isn't a plain decimal is NaN.
fn js_number(value: &str) -> f64 {
    let text = value.replace(',', "");
    let text = js_trim(&text);
    if text.is_empty() {
        return 0.0;
    }
    match text {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    for (prefix, radix) in [("0x", 16), ("0o", 8), ("0b", 2)] {
        if text.len() > 2 && text[..2].eq_ignore_ascii_case(prefix) {
            return u64::from_str_radix(&text[2..], radix).map_or(f64::NAN, |value| value as f64);
        }
    }
    // Rust also reads "inf" and "nan"; JavaScript doesn't.
    if text
        .bytes()
        .all(|b| b.is_ascii_digit() || matches!(b, b'.' | b'e' | b'E' | b'+' | b'-'))
    {
        text.parse().unwrap_or(f64::NAN)
    } else {
        f64::NAN
    }
}

/// `String(number)` in JavaScript: `712` not `712.0`, exponent form below 1e-6 and from 1e21.
fn js_number_string(value: f64) -> String {
    if value == 0.0 {
        return "0".into(); // also -0
    }
    let magnitude = value.abs();
    if (1e-6..1e21).contains(&magnitude) {
        return format!("{value}");
    }
    let text = format!("{value:e}");
    match text.split_once('e') {
        Some((mantissa, exponent)) if !exponent.starts_with('-') => {
            format!("{mantissa}e+{exponent}")
        }
        _ => text,
    }
}

/// Local time from the file name, with JavaScript's `new Date(y, m - 1, d, h, min, s)` rollover
/// (month 13 is January of the next year, and so on).
fn date_from_file_name(file_name: &str) -> Option<NaiveDateTime> {
    let caps = FILE_NAME_DATE.captures(file_name)?;
    let part = |index: usize| caps[index].parse::<i64>().ok();
    let (year, month, day) = (part(1)?, part(2)?, part(3)?);
    let (hour, minute, second) = (part(4)?, part(5)?, part(6)?);
    // JavaScript reads two-digit years as 19xx.
    let year = if (0..=99).contains(&year) {
        year + 1900
    } else {
        year
    };
    let start = NaiveDate::from_ymd_opt(i32::try_from(year).ok()?, 1, 1)?;
    let months = month - 1;
    let start = if months >= 0 {
        start.checked_add_months(Months::new(u32::try_from(months).ok()?))?
    } else {
        start.checked_sub_months(Months::new(u32::try_from(-months).ok()?))?
    };
    start.and_hms_opt(0, 0, 0)?.checked_add_signed(
        Duration::days(day - 1)
            + Duration::hours(hour)
            + Duration::minutes(minute)
            + Duration::seconds(second),
    )
}

/// Local wall time → UTC, picking the earlier time when a clock change makes it ambiguous and
/// moving forward past a skipped hour, as JavaScript does.
fn local_to_utc(local: NaiveDateTime) -> DateTime<Utc> {
    match Local.from_local_datetime(&local) {
        LocalResult::Single(time) | LocalResult::Ambiguous(time, _) => time.with_timezone(&Utc),
        LocalResult::None => Local
            .from_local_datetime(&(local + Duration::hours(1)))
            .earliest()
            .map_or_else(|| local.and_utc(), |time| time.with_timezone(&Utc)),
    }
}

/// The date formats `new Date(text)` reads that a stats file could plausibly hold: ISO 8601 with
/// an offset, a bare date (UTC midnight) or a date and time without offset (local time).
/// KovaaK's own "Challenge Start" is a bare time of day, which JavaScript can't date either.
fn parse_js_date(text: &str) -> Option<DateTime<Utc>> {
    let text = js_trim(text);
    if let Ok(time) = DateTime::parse_from_rfc3339(text) {
        return Some(time.with_timezone(&Utc));
    }
    if let Ok(date) = NaiveDate::parse_from_str(text, "%Y-%m-%d") {
        return Some(date.and_hms_opt(0, 0, 0)?.and_utc());
    }
    for format in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M"] {
        if let Ok(local) = NaiveDateTime::parse_from_str(text, format) {
            return Some(local_to_utc(local));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const FILE: &str = "VT Pasu Intermediate S5 - Challenge - 2026.11.03-19.31.02 Stats.csv";

    /// The shape of a real stats file: kill table, weapon table, then `Name:,value` rows.
    fn kovaak_csv(score: &str) -> String {
        format!(
            "Kill #,Timestamp,Bot,Weapon,TTK,Shots,Hits,Accuracy\n\
             1,19:30:02.861,target,BB Gun,0.000000s,1,1,1.000000\n\
             \n\
             Weapon,Shots,Hits,Damage Done,Damage Possible,,Sens Scale,Horiz Sens,Vert Sens,FOV\n\
             Track Master 100,5987,3153,3153.0,5987.0,\n\
             \n\
             Kills:,0\n\
             Score:,{score}\n\
             Scenario:,VT  Pasu Intermediate S5 \n\
             Challenge Start:,19:30:02.551\n\
             Horiz Sens:,42.0\n\
             DPI:,1600\n\
             FOV:,103.0\n"
        )
    }

    fn local(text: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(text, "%Y-%m-%dT%H:%M:%S").unwrap()
    }

    #[test]
    fn reads_a_kovaak_stats_file() {
        let run = parse_kovaak_csv(&kovaak_csv("712.0"), FILE, None).unwrap();
        let utc = local_to_utc(local("2026-11-03T19:31:02"));
        assert_eq!(run.scenario, "VT Pasu Intermediate S5");
        assert_eq!(run.score, 712.0);
        assert_eq!(run.date_source, DateSource::FileName);
        assert_eq!(run.played_local, "2026-11-03T19:31:02");
        assert_eq!(run.played_at, utc.timestamp_millis());
        assert_eq!(
            run.identity,
            format!("csv:{FILE}:{}:712", utc.format("%Y-%m-%dT%H:%M:%S%.3fZ"))
        );
        assert_eq!(
            (run.sensitivity, run.fov, run.dpi),
            (None, Some(103.0), Some(1600.0))
        );
    }

    #[test]
    fn a_byte_order_mark_and_crlf_change_nothing() {
        let plain = parse_kovaak_csv(&kovaak_csv("712.5"), FILE, None).unwrap();
        let windows = format!("\u{feff}{}", kovaak_csv("712.5").replace('\n', "\r\n"));
        assert_eq!(parse_kovaak_csv(&windows, FILE, None).unwrap(), plain);
    }

    #[test]
    fn reads_a_header_row_with_quoted_cells() {
        let text = "Scenario,Score,Sens\n\"Pasu, \"\"fast\"\"\",\"1,234.5\",0.35\n";
        let run = parse_kovaak_csv(text, "manual.csv", Some(0)).unwrap();
        assert_eq!(run.scenario, "Pasu, \"fast\"");
        assert_eq!(run.score, 1234.5);
        assert_eq!(run.sensitivity, Some(0.35));
        assert_eq!(run.date_source, DateSource::Fallback);
        assert_eq!(
            run.identity,
            "csv:manual.csv:1970-01-01T00:00:00.000Z:1234.5"
        );
    }

    /// A stats file always starts with the kill table's header.
    fn with_kill_header(body: &str) -> String {
        format!("Kill #,Timestamp\n{body}")
    }

    #[test]
    fn takes_the_scenario_from_the_file_name_when_the_file_has_none() {
        let file = "VT_Pasu_Easy - Challenge - 2026.11.03-19.31.02 Stats.csv";
        let run = parse_kovaak_csv(&with_kill_header("Score:,42\n"), file, None).unwrap();
        assert_eq!(run.scenario, "VT Pasu Easy");
        assert_eq!(run.score, 42.0);
    }

    #[test]
    fn reports_why_a_file_gave_no_run() {
        assert_eq!(
            parse_kovaak_csv(" \n,,\n", FILE, None),
            Err(ParseFailure::Empty)
        );
        assert_eq!(
            parse_kovaak_csv(&with_kill_header("Score:,10\n"), ".csv", None),
            Err(ParseFailure::MissingScenario)
        );
        assert_eq!(
            parse_kovaak_csv(
                &with_kill_header("Score:,abc\nScenario:,Pasu\n"),
                FILE,
                None
            ),
            Err(ParseFailure::MissingScore)
        );
    }

    #[test]
    fn a_missing_score_reads_as_zero_like_javascript() {
        // Number("") is 0 in JavaScript; the zero-score rule then leaves the run out.
        let run = parse_kovaak_csv(&with_kill_header("Scenario:,Pasu\n"), FILE, None).unwrap();
        assert_eq!(run.score, 0.0);
    }

    #[test]
    fn dates_in_file_names_roll_over_like_javascript() {
        assert_eq!(
            date_from_file_name("x 2026.13.01-00.00.00"),
            Some(local("2027-01-01T00:00:00"))
        );
        assert_eq!(
            date_from_file_name("x 2026.02.30-24.00.60"),
            Some(local("2026-03-03T00:01:00"))
        );
        assert_eq!(date_from_file_name("no date"), None);
    }

    #[test]
    fn csv_dates_are_used_only_in_formats_javascript_reads() {
        assert_eq!(
            parse_js_date("2026-11-03T10:31:02.5Z").map(|t| t.timestamp_millis()),
            Some(1_793_701_862_500)
        );
        assert_eq!(
            parse_js_date("2026-11-03").map(|t| t.timestamp_millis()),
            Some(1_793_664_000_000)
        );
        assert_eq!(parse_js_date("19:30:02.551"), None);
    }

    #[test]
    fn numbers_read_and_print_like_javascript() {
        assert_eq!(js_number(""), 0.0);
        assert_eq!(js_number(" 1,234.5 "), 1234.5);
        assert_eq!(js_number("0x10"), 16.0);
        assert_eq!(js_number(".5"), 0.5);
        assert!(js_number("inf").is_nan());
        assert!(js_number("nan").is_nan());
        assert!(js_number("12abc").is_nan());
        assert_eq!(js_number("Infinity"), f64::INFINITY);

        assert_eq!(js_number_string(712.0), "712");
        assert_eq!(js_number_string(712.25), "712.25");
        assert_eq!(js_number_string(-0.0), "0");
        assert_eq!(js_number_string(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(js_number_string(1e21), "1e+21");
        assert_eq!(js_number_string(1.5e-7), "1.5e-7");
        assert_eq!(js_number_string(0.000001), "0.000001");
    }

    #[test]
    fn field_names_are_normalized_like_javascript() {
        assert_eq!(normalize_field_name(" Horiz  Sens:"), "horiz sens");
        assert_eq!(normalize_field_name("Score: "), "score:");
        assert_eq!(normalize_field_name("FOV"), "fov");
    }
}
