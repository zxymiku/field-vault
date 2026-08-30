// Local Steam authenticator discovery: finds Steam Desktop Authenticator
// (*.maFile) and steamguard-cli (steamguard.json) data on this machine, and
// reads the official Steam client's loginusers.vdf to list known accounts.
// The official client stores no TOTP secret — these third-party data files
// are the only local source of a desktop Steam Guard secret.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct SteamAuthEntry {
    pub path: String,
    pub account_name: String,
    pub steam_id: Option<String>,
    /// "sda" (single maFile) or "steamguard-cli" (array json)
    pub source: String,
}

#[derive(Serialize)]
pub struct LocalSteamAccount {
    pub steam_id: String,
    pub account_name: String,
}

#[derive(Serialize)]
pub struct SteamScanResult {
    pub auth_files: Vec<SteamAuthEntry>,
    pub local_accounts: Vec<LocalSteamAccount>,
}

fn user_profile() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}

fn collect_files(dir: &Path, depth: usize, ext: &str, out: &mut Vec<PathBuf>) {
    if depth > 3 || out.len() >= 64 {
        return;
    }
    let rd = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_files(&p, depth + 1, ext, out);
        } else if p.extension().map(|e| e.eq_ignore_ascii_case(ext)).unwrap_or(false) {
            out.push(p);
        }
    }
}

/// Extract auth entries from a parsed JSON doc (SDA object or cli array).
fn entries_from_json(v: &serde_json::Value, path: &Path, source: &str) -> Vec<SteamAuthEntry> {
    let items: Vec<&serde_json::Value> = match v {
        serde_json::Value::Array(a) => a.iter().collect(),
        obj @ serde_json::Value::Object(_) => vec![obj],
        _ => vec![],
    };
    items
        .iter()
        .filter_map(|it| {
            let secret = it.get("shared_secret")?.as_str()?;
            if secret.is_empty() {
                return None;
            }
            Some(SteamAuthEntry {
                path: path.to_string_lossy().to_string(),
                account_name: it
                    .get("account_name")
                    .and_then(|s| s.as_str())
                    .unwrap_or("steam")
                    .to_string(),
                steam_id: it
                    .get("steam_id")
                    .map(|x| x.to_string())
                    .or_else(|| {
                        it.get("steamid")
                            .and_then(|s| s.as_str())
                            .map(String::from)
                    }),
                source: source.to_string(),
            })
        })
        .collect()
}

fn probe_auth_file(p: &Path) -> Vec<SteamAuthEntry> {
    let txt = match fs::read_to_string(p) {
        Ok(t) => t,
        Err(_) => return vec![],
    };
    let v: serde_json::Value = match serde_json::from_str(&txt) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let source = if v.is_array() { "steamguard-cli" } else { "sda" };
    entries_from_json(&v, p, source)
}

fn known_auth_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = user_profile() {
        paths.push(home.join(".config").join("steamguard-cli").join("steamguard.json"));
    }
    if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
        paths.push(appdata.join("steamguard-cli").join("steamguard.json"));
    }
    for root in ["C:\\Program Files (x86)\\Steam Desktop Authenticator", "C:\\Program Files\\Steam Desktop Authenticator"] {
        paths.push(PathBuf::from(root).join("maFiles"));
    }
    paths
}

/// Minimal VDF reader for loginusers.vdf: pulls (steamid, AccountName) pairs.
/// Quoted tokens sit at odd indices after splitting on '"'; braces live in
/// the separator slots and drive the nesting depth.
fn parse_loginusers(txt: &str) -> Vec<LocalSteamAccount> {
    let mut accounts = Vec::new();
    let tokens: Vec<&str> = txt.split('"').collect();
    let mut depth = 0i32;
    let mut in_users = false;
    let mut cur_id: Option<String> = None;

    let mut i = 1;
    while i < tokens.len() {
        let quoted = tokens[i];
        let sep_before = tokens.get(i - 1).copied().unwrap_or("");
        depth += sep_before.matches('{').count() as i32;
        depth -= sep_before.matches('}').count() as i32;
        let sep_after = tokens.get(i + 1).copied().unwrap_or("");
        let opens = sep_after.matches('{').count() as i32 - sep_after.matches('}').count() as i32;

        if !in_users {
            if depth == 0 && quoted == "users" && opens == 1 {
                in_users = true;
            }
            i += 2;
            continue;
        }
        if depth == 1 && opens == 1 && quoted.starts_with("7656") {
            cur_id = Some(quoted.to_string());
        } else if depth == 2 && quoted == "AccountName" {
            if let (Some(id), Some(v)) = (cur_id.clone(), tokens.get(i + 2)) {
                accounts.push(LocalSteamAccount {
                    steam_id: id,
                    account_name: (*v).to_string(),
                });
            }
            cur_id = None;
        }
        i += 2;
    }
    accounts
}

#[tauri::command]
pub fn scan_steam_auth() -> SteamScanResult {
    let mut auth_files = Vec::new();

    for p in known_auth_paths() {
        if p.is_file() {
            auth_files.extend(probe_auth_file(&p));
        } else if p.is_dir() {
            let mut found = Vec::new();
            collect_files(&p, 0, "maFile", &mut found);
            for f in found {
                auth_files.extend(probe_auth_file(&f));
            }
        }
    }
    // shallow user-folder sweep for portable SDA installs
    if let Some(home) = user_profile() {
        for root in [home.join("Documents"), home.join("Desktop")] {
            let mut found = Vec::new();
            collect_files(&root, 0, "maFile", &mut found);
            for f in found {
                auth_files.extend(probe_auth_file(&f));
            }
        }
    }
    auth_files.dedup_by(|a, b| a.path == b.path && a.account_name == b.account_name);

    let mut local_accounts = Vec::new();
    let vdf = PathBuf::from("C:\\Program Files (x86)\\Steam\\config\\loginusers.vdf");
    if let Ok(txt) = fs::read_to_string(&vdf) {
        local_accounts = parse_loginusers(&txt);
    }

    SteamScanResult {
        auth_files,
        local_accounts,
    }
}

#[tauri::command]
pub fn read_steam_auth_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let ok_ext = p
        .extension()
        .map(|e| e == "maFile" || e == "json")
        .unwrap_or(false);
    if !ok_ext {
        return Err("BAD_EXT".into());
    }
    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.len() > 1024 * 1024 {
        return Err("TOO_LARGE".into());
    }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::parse_loginusers;

    #[test]
    fn loginusers_parses_account_names() {
        let vdf = r#"
"users"
{
    "76561198000000001"
    {
        "AccountName"        "alice"
        "Personaname"        "Alice"
        "mostrecent"        "1"
    }
    "76561198000000002"
    {
        "AccountName"        "bob"
        "mostrecent"        "0"
    }
}
"#;
        let accs = parse_loginusers(vdf);
        assert_eq!(accs.len(), 2);
        assert_eq!(accs[0].steam_id, "76561198000000001");
        assert_eq!(accs[0].account_name, "alice");
        assert_eq!(accs[1].account_name, "bob");
    }
}
