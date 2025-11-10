use std::sync::Mutex;
use std::process::{Child, Command};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::io::{BufRead, BufReader, Write};
use tauri::Manager;
use tauri::{menu::{Menu, MenuItem}, tray::{TrayIconBuilder, TrayIconEvent}};
use tauri_plugin_updater::UpdaterExt;
use rusqlite::Connection;
use chrono::DateTime;

#[derive(Clone, Serialize, Deserialize)]
struct Character {
    name: String,
    realm: String,
    region: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct Config {
    #[serde(skip_serializing_if = "Option::is_none")]
    token: Option<String>,
    #[serde(rename = "clientId")]
    client_id: String,
    #[serde(rename = "guildId")]
    guild_id: String,
    #[serde(rename = "tokenChannel")]
    token_channel: String,
    characters: Vec<Character>,
}

#[derive(Clone, Serialize, Deserialize)]
struct BlizzardCredentials {
    #[serde(rename = "clientId")]
    client_id: String,
    #[serde(rename = "clientSecret")]
    client_secret: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct Settings {
    #[serde(rename = "firstRun", default)]
    first_run: bool,
    #[serde(rename = "autoStart", default)]
    auto_start: bool,
    #[serde(rename = "minimizeToTray", default = "default_true")]
    minimize_to_tray: bool,
    #[serde(rename = "startMinimized", default)]
    start_minimized: bool,
    #[serde(rename = "openOnStartup", default)]
    open_on_startup: bool,
    #[serde(rename = "autoStartBot", default)]
    auto_start_bot: bool,
}

fn default_true() -> bool {
    true
}

struct BotState {
    process: Option<Child>,
    status: String,
}

struct AppState {
    bot: Mutex<BotState>,
}

#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let settings_path = app_dir.join("settings.json");

    if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))
    } else {
        // Default settings for first run
        Ok(Settings {
            first_run: true,
            auto_start: false,
            minimize_to_tray: true,
            start_minimized: false,
            open_on_startup: false,
            auto_start_bot: false,
        })
    }
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    // Handle Windows startup registry
    #[cfg(target_os = "windows")]
    {
        if settings.open_on_startup {
            set_windows_startup(&app, settings.start_minimized)?;
        } else {
            remove_windows_startup()?;
        }
    }

    let settings_path = app_dir.join("settings.json");
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings: {}", e))
}

#[cfg(target_os = "windows")]
fn set_windows_startup(_app: &tauri::AppHandle, start_minimized: bool) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_WRITE)
        .map_err(|e| format!("Failed to open Run registry key: {}", e))?;

    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?;

    let mut command = format!("\"{}\"", exe_path.display());
    if start_minimized {
        command.push_str(" --minimized");
    }

    run_key
        .set_value("DaeBot", &command)
        .map_err(|e| format!("Failed to set registry value: {}", e))?;

    println!("Added DaeBot to Windows startup");
    Ok(())
}

#[cfg(target_os = "windows")]
fn remove_windows_startup() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_WRITE)
        .map_err(|e| format!("Failed to open Run registry key: {}", e))?;

    match run_key.delete_value("DaeBot") {
        Ok(_) => println!("Removed DaeBot from Windows startup"),
        Err(_) => {} // Ignore error if value doesn't exist
    }

    Ok(())
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<Config, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let config_path = app_dir.join("config.json");
    println!("Loading config from: {:?}", config_path);

    if !config_path.exists() {
        // Create blank config on first run
        println!("Config not found, creating blank config");
        let blank_config = Config {
            token: None,
            client_id: String::new(),
            guild_id: String::new(),
            token_channel: String::new(),
            characters: Vec::new(),
        };

        let content = serde_json::to_string_pretty(&blank_config)
            .map_err(|e| format!("Failed to serialize blank config: {}", e))?;

        fs::write(&config_path, content)
            .map_err(|e| format!("Failed to write blank config: {}", e))?;

        return Ok(blank_config);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config: Config) -> Result<(), String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let config_path = app_dir.join("config.json");
    println!("Saving config to: {:?}", config_path);

    // Read existing config to preserve token if not provided
    let mut final_config = config;

    if final_config.token.is_none() && config_path.exists() {
        println!("Token not provided, reading existing config to preserve it");
        let existing_content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read existing config: {}", e))?;

        if let Ok(existing_config) = serde_json::from_str::<Config>(&existing_content) {
            final_config.token = existing_config.token;
            println!("Preserved existing token");
        }
    }

    let content = serde_json::to_string_pretty(&final_config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))
}

#[tauri::command]
fn start_bot(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<String, String> {
    println!("start_bot command called");
    let mut bot = state.bot.lock().unwrap();

    if bot.process.is_some() {
        println!("Bot process already exists, returning error");
        return Err("Bot is already running".to_string());
    }

    println!("No existing bot process, starting new one");

    // Use CARGO_MANIFEST_DIR environment variable to get project root
    // In dev mode, this points to src-tauri, so we go up one level
    let (project_root, bot_exe_path) = if cfg!(debug_assertions) {
        // Development mode - go up from src-tauri to project root
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or("Failed to find project root")?
            .to_path_buf();
        let exe = root.join("main.js");
        (root, exe)
    } else {
        // Production mode - try multiple possible locations for bot.exe
        let resource_dir = app.path().resource_dir()
            .map_err(|e| format!("Failed to get resource directory: {}", e))?;
        println!("Resource directory: {:?}", resource_dir);

        let mut checked_paths = Vec::new();
        let mut found = false;

        // Try bot.exe directly in resource directory
        let mut bot_exe = resource_dir.join("bot.exe");
        checked_paths.push(bot_exe.clone());
        if bot_exe.exists() {
            found = true;
        }

        if !found {
            // Try looking in exe directory (where DaeBot.exe is)
            let exe_dir = std::env::current_exe()
                .map_err(|e| format!("Failed to get current executable: {}", e))?
                .parent()
                .ok_or("Failed to get parent directory")?
                .to_path_buf();
            bot_exe = exe_dir.join("bot.exe");
            checked_paths.push(bot_exe.clone());
            if bot_exe.exists() {
                found = true;
            }
        }

        if !found {
            // Try resources subdirectory
            let exe_dir = std::env::current_exe()
                .map_err(|e| format!("Failed to get current executable: {}", e))?
                .parent()
                .ok_or("Failed to get parent directory")?
                .to_path_buf();
            bot_exe = exe_dir.join("resources").join("bot.exe");
            checked_paths.push(bot_exe.clone());
            if bot_exe.exists() {
                found = true;
            }
        }

        if !found {
            // Try _up_/dist subdirectory (updater staging directory)
            let exe_dir = std::env::current_exe()
                .map_err(|e| format!("Failed to get current executable: {}", e))?
                .parent()
                .ok_or("Failed to get parent directory")?
                .to_path_buf();
            bot_exe = exe_dir.join("_up_").join("dist").join("bot.exe");
            checked_paths.push(bot_exe.clone());
            if bot_exe.exists() {
                found = true;
            }
        }

        if !found {
            // Try looking in all subdirectories of exe directory
            let exe_dir = std::env::current_exe()
                .map_err(|e| format!("Failed to get current executable: {}", e))?
                .parent()
                .ok_or("Failed to get parent directory")?
                .to_path_buf();

            // Search for bot.exe in subdirectories
            if let Ok(entries) = fs::read_dir(&exe_dir) {
                for entry in entries.flatten() {
                    if let Ok(file_type) = entry.file_type() {
                        if file_type.is_dir() {
                            let potential_path = entry.path().join("bot.exe");
                            if potential_path.exists() {
                                bot_exe = potential_path;
                                checked_paths.push(bot_exe.clone());
                                found = true;
                                break;
                            }
                            // Also check dist subdirectory
                            let potential_path = entry.path().join("dist").join("bot.exe");
                            if potential_path.exists() {
                                bot_exe = potential_path;
                                checked_paths.push(bot_exe.clone());
                                found = true;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if !found {
            let mut error_msg = "bot.exe not found. Checked locations:\n".to_string();
            for path in checked_paths {
                error_msg.push_str(&format!("  - {:?}\n", path));
            }
            return Err(error_msg);
        }

        println!("Found bot.exe at: {:?}", bot_exe);

        // Use the directory containing bot.exe as the working directory
        let work_dir = bot_exe.parent()
            .ok_or("Failed to get bot.exe parent directory")?
            .to_path_buf();

        (work_dir, bot_exe)
    };

    println!("Working directory: {:?}", project_root);
    println!("Bot executable: {:?}", bot_exe_path);

    // In production, use the bundled bot.exe
    // In development, use node main.js for easier debugging
    let child = if cfg!(debug_assertions) {
        // Development mode - use node
        Command::new("node")
            .arg("main.js")
            .current_dir(&project_root)
            .spawn()
            .map_err(|e| format!("Failed to start bot from {:?}: {}", project_root, e))?
    } else {
        // Production mode - use bot.exe without console window
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            Command::new(&bot_exe_path)
                .current_dir(&project_root)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to start bot.exe from {:?}: {}", bot_exe_path, e))?
        }

        #[cfg(not(target_os = "windows"))]
        {
            Command::new(&bot_exe_path)
                .current_dir(&project_root)
                .spawn()
                .map_err(|e| format!("Failed to start bot.exe from {:?}: {}", bot_exe_path, e))?
        }
    };

    bot.process = Some(child);
    bot.status = "running".to_string();

    Ok("Bot started successfully".to_string())
}

#[tauri::command]
fn stop_bot(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<String, String> {
    println!("stop_bot called");

    // First, extract the process and set status to "stopping"
    let process_opt = {
        let mut bot = state.bot.lock().unwrap();
        if bot.process.is_some() {
            bot.status = "stopping".to_string();
            bot.process.take()
        } else {
            None
        }
    };

    if let Some(mut process) = process_opt {
        let pid = process.id();
        println!("Killing bot process with PID: {}", pid);

        // Spawn background task to kill the process using Tauri's async runtime
        tauri::async_runtime::spawn(async move {
            // On Windows, use taskkill for forceful termination without showing window
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;

                let kill_result = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();

                match kill_result {
                    Ok(output) => {
                        println!("taskkill output: {:?}", String::from_utf8_lossy(&output.stdout));
                        if !output.status.success() {
                            println!("taskkill stderr: {:?}", String::from_utf8_lossy(&output.stderr));
                        }
                    },
                    Err(e) => {
                        println!("taskkill command failed: {}", e);
                        // Fallback to regular kill
                        let _ = process.kill();
                    }
                }
            }

            // On non-Windows systems, use regular kill
            #[cfg(not(target_os = "windows"))]
            {
                let _ = process.kill();
            }

            // Set final status to "stopped" using app state
            if let Some(state) = app.try_state::<AppState>() {
                let mut bot = state.bot.lock().unwrap();
                bot.status = "stopped".to_string();
                println!("Bot stopped successfully");
            }
        });

        // Return immediately - the UI won't freeze
        Ok("Bot is stopping".to_string())
    } else {
        println!("Bot is not running");
        Err("Bot is not running".to_string())
    }
}

#[tauri::command]
fn get_bot_status(state: tauri::State<AppState>) -> String {
    let mut bot = state.bot.lock().unwrap();

    // Check if the process is actually still running
    if let Some(ref mut process) = bot.process {
        match process.try_wait() {
            Ok(Some(_)) => {
                // Process has exited
                bot.process = None;
                bot.status = "stopped".to_string();
            }
            Ok(None) => {
                // Process is still running
                bot.status = "running".to_string();
            }
            Err(_) => {
                // Error checking process status
                bot.process = None;
                bot.status = "stopped".to_string();
            }
        }
    } else {
        bot.status = "stopped".to_string();
    }

    bot.status.clone()
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle, state: tauri::State<AppState>) {
    println!("Quit command received, stopping bot and exiting application");

    // Stop the bot if it's running
    let mut bot = state.bot.lock().unwrap();
    if let Some(process) = bot.process.take() {
        let pid = process.id();
        println!("Stopping bot process with PID: {}", pid);

        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = process.kill();
        }

        bot.status = "stopped".to_string();
    }
    drop(bot); // Release the lock before exiting

    app.exit(0);
}

#[tauri::command]
async fn deploy_discord_commands(app: tauri::AppHandle) -> Result<String, String> {
    println!("deploy_discord_commands command called");

    // Get the resource directory where dist-backend is bundled
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    println!("Resource directory: {:?}", resource_dir);

    // Check multiple possible locations for dist-backend
    // 1. Direct path (dev builds)
    // 2. _up_ subdirectory (production builds with updates)
    let possible_paths = vec![
        resource_dir.join("dist-backend"),
        resource_dir.join("_up_").join("dist-backend"),
    ];

    let mut backend_dir = None;
    for path in &possible_paths {
        println!("Checking path: {:?}", path);
        if path.join("deploy-commands.js").exists() {
            backend_dir = Some(path.clone());
            println!("Found deploy-commands.js at: {:?}", path);
            break;
        }
    }

    let backend_dir = backend_dir.ok_or_else(|| {
        format!(
            "deploy-commands.js not found. Checked:\n  - {:?}\n  - {:?}",
            possible_paths[0].join("deploy-commands.js"),
            possible_paths[1].join("deploy-commands.js")
        )
    })?;

    // Load config to pass to deploy script
    let config = load_config(&app)?;
    let client_id = config.get("clientId")
        .and_then(|v| v.as_str())
        .ok_or("Missing clientId in config")?;
    let guild_id = config.get("guildId")
        .and_then(|v| v.as_str())
        .ok_or("Missing guildId in config")?;
    let token = config.get("token")
        .and_then(|v| v.as_str())
        .ok_or("Missing token in config")?;

    // Spawn Node.js process to run deploy-commands.js
    // Pass config via environment variables since config.json may not be accessible
    let output = Command::new("node")
        .arg("deploy-commands.js")
        .current_dir(&backend_dir)
        .env("DISCORD_CLIENT_ID", client_id)
        .env("DISCORD_GUILD_ID", guild_id)
        .env("DISCORD_TOKEN", token)
        .output()
        .map_err(|e| format!("Failed to execute deploy script: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    println!("Deploy script stdout: {}", stdout);
    if !stderr.is_empty() {
        println!("Deploy script stderr: {}", stderr);
    }

    if output.status.success() {
        Ok(format!("Successfully deployed commands!\n\n{}", stdout))
    } else {
        Err(format!("Failed to deploy commands:\n{}\n{}", stdout, stderr))
    }
}

#[tauri::command]
async fn delete_discord_commands(app: tauri::AppHandle) -> Result<String, String> {
    println!("delete_discord_commands command called");

    // Load config
    let config = load_config(&app)?;
    let client_id = config.get("clientId")
        .and_then(|v| v.as_str())
        .ok_or("Missing clientId in config")?;
    let guild_id = config.get("guildId")
        .and_then(|v| v.as_str())
        .ok_or("Missing guildId in config")?;
    let token = config.get("token")
        .and_then(|v| v.as_str())
        .ok_or("Missing token in config")?;

    // Get all registered commands
    let client = reqwest::Client::new();
    let list_url = format!("https://discord.com/api/v9/applications/{}/guilds/{}/commands", client_id, guild_id);

    let response = client
        .get(&list_url)
        .header("Authorization", format!("Bot {}", token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch commands: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Discord API error ({}): {}", status, error_text));
    }

    let commands: Vec<serde_json::Value> = response.json().await
        .map_err(|e| format!("Failed to parse commands list: {}", e))?;

    if commands.is_empty() {
        return Ok("No commands to delete".to_string());
    }

    println!("Found {} commands to delete", commands.len());

    // Delete each command
    let mut deleted_count = 0;
    for cmd in commands {
        if let Some(cmd_id) = cmd.get("id").and_then(|v| v.as_str()) {
            let delete_url = format!("https://discord.com/api/v9/applications/{}/guilds/{}/commands/{}",
                client_id, guild_id, cmd_id);

            match client
                .delete(&delete_url)
                .header("Authorization", format!("Bot {}", token))
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    deleted_count += 1;
                    if let Some(name) = cmd.get("name").and_then(|v| v.as_str()) {
                        println!("Deleted command: /{}", name);
                    }
                }
                Ok(resp) => {
                    println!("Failed to delete command {}: {}", cmd_id, resp.status());
                }
                Err(e) => {
                    println!("Error deleting command {}: {}", cmd_id, e);
                }
            }
        }
    }

    Ok(format!("Successfully deleted {} command(s)", deleted_count))
}

// Helper function to load config
fn load_config(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let config_path = app_dir.join("config.json");

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config.json: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config.json: {}", e))
}

#[tauri::command]
fn copy_commands_folder(app: tauri::AppHandle) -> Result<String, String> {
    println!("copy_commands_folder command called");

    // Get AppData directory
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let commands_dir = app_dir.join("commands");

    // Get resource directory
    let resource_path = app.path().resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    println!("Resource directory: {:?}", resource_path);

    // Check multiple possible locations for commands
    // 1. Direct path (dev builds): dist-backend/commands
    // 2. _up_ subdirectory (production builds): _up_/dist-backend/commands
    let possible_paths = vec![
        resource_path.join("dist-backend").join("commands"),
        resource_path.join("_up_").join("dist-backend").join("commands"),
    ];

    let mut source_commands_path = None;
    for path in &possible_paths {
        println!("Checking for commands at: {:?}", path);
        if path.exists() {
            source_commands_path = Some(path.clone());
            println!("Found commands directory at: {:?}", path);
            break;
        }
    }

    let source_commands_path = source_commands_path.ok_or_else(|| {
        format!(
            "Commands not found. Checked:\n  - {:?}\n  - {:?}",
            possible_paths[0],
            possible_paths[1]
        )
    })?;

    // Create commands directory if it doesn't exist
    if !commands_dir.exists() {
        fs::create_dir_all(&commands_dir)
            .map_err(|e| format!("Failed to create commands directory: {}", e))?;
    }

    // Find all .js files in the bundled commands directory
    let entries = fs::read_dir(&source_commands_path)
        .map_err(|e| format!("Failed to read commands directory: {}", e))?;

    let mut copied_files = Vec::new();

    for entry in entries.flatten() {
        let file_name = entry.file_name();

        if let Some(name_str) = file_name.to_str() {
            if name_str.ends_with(".js") {
                let source_file = source_commands_path.join(&file_name);
                let dest_file = commands_dir.join(&file_name);

                println!("Copying {:?} to {:?}", source_file, dest_file);
                fs::copy(&source_file, &dest_file)
                    .map_err(|e| format!("Failed to copy {:?}: {}", file_name, e))?;

                copied_files.push(name_str.to_string());
            }
        }
    }

    if copied_files.is_empty() {
        return Err("No command files found to copy".to_string());
    }

    Ok(format!(
        "Successfully copied {} command file(s) to:\n{:?}\n\nFiles:\n{}",
        copied_files.len(),
        commands_dir,
        copied_files.join("\n")
    ))
}

#[derive(Clone, Serialize, Deserialize)]
struct UpdateInfo {
    version: String,
    #[serde(rename = "currentVersion")]
    current_version: String,
    available: bool,
    #[serde(rename = "isPrerelease")]
    is_prerelease: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    changelog: Option<String>,
}

// Helper struct for GitHub API response
#[derive(Deserialize)]
struct GitHubRelease {
    body: Option<String>,
}

// Fetch changelog from GitHub releases
async fn fetch_changelog(version: &str) -> Option<String> {
    let url = format!("https://api.github.com/repos/Drizzyt77/DaeBotJS/releases/tags/v{}", version);

    match reqwest::Client::new()
        .get(&url)
        .header("User-Agent", "DaeBot")
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<GitHubRelease>().await {
                Ok(release) => release.body,
                Err(e) => {
                    println!("Failed to parse GitHub release: {}", e);
                    None
                }
            }
        }
        Err(e) => {
            println!("Failed to fetch changelog from GitHub: {}", e);
            None
        }
    }
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    println!("Checking for updates...");

    // Get bot settings to check beta channel preference
    let settings = match get_bot_settings(app.clone()) {
        Ok(s) => s,
        Err(e) => {
            println!("Failed to get bot settings: {}, defaulting to stable channel", e);
            // If we can't get settings, default to stable channel (beta_channel = false)
            BotSettings {
                season_id: 0,
                season_name: String::new(),
                default_region: String::new(),
                default_realm: String::new(),
                active_dungeons: Vec::new(),
                beta_channel: false,
                updated_at: None,
            }
        }
    };

    let current_version = app.package_info().version.to_string();
    println!("Current version: {}", current_version);
    println!("Beta channel enabled: {}", settings.beta_channel);

    // Try to check for updates using the updater API
    match app.updater_builder().build() {
        Ok(updater) => {
            match updater.check().await {
                Ok(update_result) => {
                    if let Some(update) = update_result {
                        let new_version = update.version.clone();
                        let is_prerelease = new_version.contains("beta") || new_version.contains("alpha") || new_version.contains("rc");

                        println!("Update available: {}", new_version);
                        println!("Is pre-release: {}", is_prerelease);

                        // If user is on stable channel, don't show pre-release updates
                        if !settings.beta_channel && is_prerelease {
                            println!("Skipping pre-release update (user is on stable channel)");
                            return Ok(UpdateInfo {
                                version: current_version.clone(),
                                current_version,
                                available: false,
                                is_prerelease: false,
                                changelog: None,
                            });
                        }

                        // Fetch changelog from GitHub
                        let changelog = fetch_changelog(&new_version).await;

                        Ok(UpdateInfo {
                            version: new_version,
                            current_version,
                            available: true,
                            is_prerelease,
                            changelog,
                        })
                    } else {
                        println!("No updates available");
                        Ok(UpdateInfo {
                            version: current_version.clone(),
                            current_version,
                            available: false,
                            is_prerelease: false,
                            changelog: None,
                        })
                    }
                }
                Err(e) => {
                    println!("Error checking for updates: {}", e);
                    // Return no update available on error
                    Ok(UpdateInfo {
                        version: current_version.clone(),
                        current_version,
                        available: false,
                        is_prerelease: false,
                        changelog: None,
                    })
                }
            }
        }
        Err(e) => {
            println!("Error building updater: {}", e);
            Ok(UpdateInfo {
                version: current_version.clone(),
                current_version,
                available: false,
                is_prerelease: false,
                changelog: None,
            })
        }
    }
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn get_blizzard_credentials(app: tauri::AppHandle) -> Result<BlizzardCredentials, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let env_path = app_dir.join(".env");
    println!("Loading .env from: {:?}", env_path);

    if !env_path.exists() {
        // Return empty credentials
        return Ok(BlizzardCredentials {
            client_id: String::new(),
            client_secret: String::new(),
        });
    }

    let content = fs::read_to_string(&env_path)
        .map_err(|e| format!("Failed to read .env: {}", e))?;

    let mut client_id = String::new();
    let mut client_secret = String::new();

    for line in content.lines() {
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim();
            match key {
                "BLIZZARD_CLIENT_ID" => client_id = value.to_string(),
                "BLIZZARD_CLIENT_SECRET" => client_secret = value.to_string(),
                _ => {}
            }
        }
    }

    Ok(BlizzardCredentials {
        client_id,
        client_secret,
    })
}

#[tauri::command]
fn save_blizzard_credentials(app: tauri::AppHandle, credentials: BlizzardCredentials) -> Result<(), String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let env_path = app_dir.join(".env");
    println!("Saving .env to: {:?}", env_path);

    let content = format!(
        "BLIZZARD_CLIENT_ID={}\nBLIZZARD_CLIENT_SECRET={}\n",
        credentials.client_id,
        credentials.client_secret
    );

    fs::write(&env_path, content)
        .map_err(|e| format!("Failed to write .env: {}", e))
}

#[tauri::command]
fn import_database(app: tauri::AppHandle, file_path: String) -> Result<String, String> {
    println!("[import_database] Called with file_path: '{}'", file_path);
    println!("[import_database] file_path length: {}", file_path.len());
    println!("[import_database] file_path is_empty: {}", file_path.is_empty());

    let source_path = PathBuf::from(&file_path);
    println!("[import_database] PathBuf created: {:?}", source_path);
    println!("[import_database] PathBuf exists: {}", source_path.exists());

    // Verify source file exists
    if !source_path.exists() {
        let error_msg = format!("Source database file does not exist: '{}'", file_path);
        println!("[import_database] ERROR: {}", error_msg);
        return Err(error_msg);
    }

    // Verify it's a valid SQLite database by trying to open it
    match Connection::open(&source_path) {
        Ok(conn) => {
            // Verify it has the expected tables
            let table_check: Result<i64, _> = conn.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND (name='mythic_runs' OR name='token_prices')",
                [],
                |row| row.get(0)
            );

            match table_check {
                Ok(count) if count > 0 => {
                    println!("Database validation passed, found {} expected tables", count);
                }
                _ => {
                    return Err("Database does not contain expected tables (mythic_runs or token_prices)".to_string());
                }
            }
        }
        Err(e) => {
            return Err(format!("Invalid SQLite database: {}", e));
        }
    }

    // Get destination path
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let data_dir = app_dir.join("data");
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;

    let dest_path = data_dir.join("mythic_runs.db");

    // Backup existing database if it exists
    if dest_path.exists() {
        let backup_path = data_dir.join(format!(
            "mythic_runs_backup_{}.db",
            chrono::Local::now().format("%Y%m%d_%H%M%S")
        ));
        println!("Backing up existing database to: {:?}", backup_path);
        fs::copy(&dest_path, &backup_path)
            .map_err(|e| format!("Failed to backup existing database: {}", e))?;
    }

    // Copy the new database
    fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("Failed to copy database: {}", e))?;

    println!("Database imported successfully to: {:?}", dest_path);
    Ok(format!("Database imported successfully! Old database backed up if it existed."))
}

// Helper function to log updater messages to a file
fn log_updater(message: &str) {
    // Write to AppData/Roaming/DaeBot/updater.log
    let log_path = if let Some(appdata) = std::env::var_os("APPDATA") {
        PathBuf::from(appdata).join("com.daebot.app").join("updater.log")
    } else {
        PathBuf::from("updater.log")
    };

    // Ensure directory exists
    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(file, "[{}] {}", timestamp, message);
        let _ = file.flush();
    }

    // Also print to console
    println!("{}", message);
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<String, String> {
    log_updater("[UPDATER] Starting update installation...");

    match app.updater_builder().build() {
        Ok(updater) => {
            log_updater("[UPDATER] Updater builder created successfully");

            match updater.check().await {
                Ok(update_result) => {
                    if let Some(update) = update_result {
                        log_updater(&format!("[UPDATER] Update found: version {}", update.version));
                        log_updater(&format!("[UPDATER] Download URL: {}", update.download_url));

                        // Download and install the update
                        match update.download_and_install(|chunk_length, content_length| {
                            log_updater(&format!("[UPDATER] Download progress: {} of {:?} bytes", chunk_length, content_length));
                        }, || {
                            log_updater("[UPDATER] Download finished, starting installation...");
                        }).await {
                            Ok(_) => {
                                log_updater("[UPDATER] Update installed successfully, restarting...");
                                app.restart();
                            }
                            Err(e) => {
                                let error_msg = format!("[UPDATER ERROR] Failed to install update: {:?}", e);
                                log_updater(&error_msg);
                                Err(error_msg)
                            }
                        }
                    } else {
                        let msg = "[UPDATER] No updates available";
                        log_updater(msg);
                        Err(msg.to_string())
                    }
                }
                Err(e) => {
                    let error_msg = format!("[UPDATER ERROR] Error checking for updates: {:?}", e);
                    log_updater(&error_msg);
                    Err(error_msg)
                }
            }
        }
        Err(e) => {
            let error_msg = format!("[UPDATER ERROR] Error building updater: {:?}", e);
            log_updater(&error_msg);
            Err(error_msg)
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct LogEntry {
    timestamp: String,
    level: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Stats {
    #[serde(rename = "totalRuns")]
    total_runs: i64,
    #[serde(rename = "totalCharacters")]
    total_characters: i64,
    #[serde(rename = "lastSync")]
    last_sync: Option<String>,
    #[serde(rename = "databaseSize")]
    database_size: u64,
}

#[derive(Clone, Serialize, Deserialize)]
struct SyncHistoryEntry {
    timestamp: String,
    success: bool,
    #[serde(rename = "syncType")]
    sync_type: String,
    #[serde(rename = "runsAdded", skip_serializing_if = "Option::is_none")]
    runs_added: Option<i64>,
    #[serde(rename = "charactersProcessed", skip_serializing_if = "Option::is_none")]
    characters_processed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct BotSettings {
    #[serde(rename = "seasonId")]
    season_id: i64,
    #[serde(rename = "seasonName")]
    season_name: String,
    #[serde(rename = "defaultRegion")]
    default_region: String,
    #[serde(rename = "defaultRealm")]
    default_realm: String,
    #[serde(rename = "activeDungeons")]
    active_dungeons: Vec<String>,
    #[serde(rename = "betaChannel")]
    beta_channel: bool,
    #[serde(rename = "updatedAt", skip_serializing_if = "Option::is_none")]
    updated_at: Option<i64>,
}

#[tauri::command]
fn get_available_seasons(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db_path = app_dir.join("data").join("mythic_runs.db");

    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable WAL mode
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    // Query distinct seasons ordered by most recent
    let mut stmt = conn.prepare(
        "SELECT DISTINCT season FROM mythic_runs WHERE season IS NOT NULL ORDER BY season DESC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let seasons_iter = stmt.query_map([], |row| {
        row.get(0)
    }).map_err(|e| format!("Failed to query seasons: {}", e))?;

    let mut seasons = Vec::new();
    for season in seasons_iter {
        seasons.push(season.map_err(|e| format!("Failed to read season: {}", e))?);
    }

    Ok(seasons)
}

#[tauri::command]
fn get_bot_settings(app: tauri::AppHandle) -> Result<BotSettings, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db_path = app_dir.join("data").join("mythic_runs.db");

    if !db_path.exists() {
        return Err("Database not found".to_string());
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable WAL mode
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    // Query bot settings
    let settings = conn.query_row(
        "SELECT current_season_id, current_season_name, default_region, default_realm, active_dungeons, beta_channel, updated_at
         FROM bot_settings WHERE id = 1",
        [],
        |row| {
            let dungeons_json: String = row.get(4)?;
            let dungeons: Vec<String> = serde_json::from_str(&dungeons_json).unwrap_or_default();
            let beta_channel_int: i64 = row.get(5)?;

            Ok(BotSettings {
                season_id: row.get(0)?,
                season_name: row.get(1)?,
                default_region: row.get(2)?,
                default_realm: row.get(3)?,
                active_dungeons: dungeons,
                beta_channel: beta_channel_int != 0,
                updated_at: Some(row.get(6)?),
            })
        }
    ).map_err(|e| format!("Failed to query bot settings: {}", e))?;

    Ok(settings)
}

#[tauri::command]
fn update_bot_settings(app: tauri::AppHandle, settings: BotSettings) -> Result<(), String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db_path = app_dir.join("data").join("mythic_runs.db");

    if !db_path.exists() {
        return Err("Database not found".to_string());
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable WAL mode
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    // Validate season name format
    if !settings.season_name.starts_with("season-") {
        return Err("Season name must start with 'season-' (e.g., season-mid-1)".to_string());
    }

    // Serialize dungeons to JSON
    let dungeons_json = serde_json::to_string(&settings.active_dungeons)
        .map_err(|e| format!("Failed to serialize dungeons: {}", e))?;

    // Update bot settings
    conn.execute(
        "UPDATE bot_settings
         SET current_season_id = ?1,
             current_season_name = ?2,
             default_region = ?3,
             default_realm = ?4,
             active_dungeons = ?5,
             beta_channel = ?6,
             updated_at = ?7
         WHERE id = 1",
        (
            settings.season_id,
            &settings.season_name,
            &settings.default_region,
            &settings.default_realm,
            &dungeons_json,
            settings.beta_channel as i64,
            chrono::Utc::now().timestamp_millis(),
        ),
    ).map_err(|e| format!("Failed to update bot settings: {}", e))?;

    Ok(())
}

#[tauri::command]
fn get_startup_error(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let error_path = app_dir.join("startup-error.txt");

    if !error_path.exists() {
        return Ok(None);
    }

    match fs::read_to_string(&error_path) {
        Ok(content) => {
            // Delete the error file after reading it
            let _ = fs::remove_file(&error_path);
            Ok(Some(content))
        }
        Err(e) => Err(format!("Failed to read startup error: {}", e))
    }
}

#[tauri::command]
fn get_logs(app: tauri::AppHandle, limit: Option<usize>) -> Result<Vec<LogEntry>, String> {
    let limit = limit.unwrap_or(100);

    // Get app data directory
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let logs_dir = app_dir.join("logs");

    // Read current log file path from marker
    let marker_path = logs_dir.join("current.log");
    let log_file = if marker_path.exists() {
        match fs::read_to_string(&marker_path) {
            Ok(path) => PathBuf::from(path.trim()),
            Err(_) => {
                // Fallback: find most recent log file
                get_most_recent_log_file(&logs_dir)?
            }
        }
    } else {
        // Fallback: find most recent log file
        get_most_recent_log_file(&logs_dir)?
    };

    if !log_file.exists() {
        return Ok(Vec::new());
    }

    // Use a more efficient approach: read file from end backwards
    let file = fs::File::open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let metadata = file.metadata()
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    let file_size = metadata.len();

    // If file is small, just read it all
    if file_size < 1_000_000 {  // Less than 1MB
        let reader = BufReader::new(file);
        let mut logs = Vec::new();

        for line in reader.lines() {
            if let Ok(line) = line {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                    logs.push(parse_log_entry(json));
                }
            }
        }

        // Return last N entries
        let start = if logs.len() > limit { logs.len() - limit } else { 0 };
        return Ok(logs[start..].to_vec());
    }

    // For large files, read backwards from end to get most recent logs efficiently
    // This prevents reading the entire file when we only need the last few lines
    use std::io::{Seek, SeekFrom, Read};
    let mut file = fs::File::open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    // Read last 500KB (should contain way more than limit lines)
    let read_size = std::cmp::min(500_000, file_size);
    let seek_pos = file_size.saturating_sub(read_size);

    file.seek(SeekFrom::Start(seek_pos))
        .map_err(|e| format!("Failed to seek in log file: {}", e))?;

    let mut buffer = String::new();
    file.read_to_string(&mut buffer)
        .map_err(|e| format!("Failed to read log file: {}", e))?;

    // Split into lines and parse
    let mut logs = Vec::new();
    for line in buffer.lines() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            logs.push(parse_log_entry(json));
        }
    }

    // Return last N entries
    let start = if logs.len() > limit { logs.len() - limit } else { 0 };
    Ok(logs[start..].to_vec())
}

// Helper function to parse a log entry
fn parse_log_entry(json: serde_json::Value) -> LogEntry {
    let timestamp = json["timestamp"].as_str().unwrap_or("").to_string();
    let level = json["level"].as_str().unwrap_or("INFO").to_string();
    let message = json["message"].as_str().unwrap_or("").to_string();

    // Collect all other fields as metadata
    let mut metadata = serde_json::Map::new();
    if let Some(obj) = json.as_object() {
        for (key, value) in obj {
            if key != "timestamp" && key != "level" && key != "message" {
                metadata.insert(key.clone(), value.clone());
            }
        }
    }

    LogEntry {
        timestamp,
        level,
        message,
        metadata: if metadata.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(metadata))
        },
    }
}

// Helper function to find most recent log file
fn get_most_recent_log_file(logs_dir: &PathBuf) -> Result<PathBuf, String> {
    if !logs_dir.exists() {
        return Err("Logs directory does not exist".to_string());
    }

    let mut log_files: Vec<_> = fs::read_dir(logs_dir)
        .map_err(|e| format!("Failed to read logs directory: {}", e))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().extension().and_then(|s| s.to_str()) == Some("log")
                && entry.path().file_name().and_then(|s| s.to_str())
                    .map(|name| name.starts_with("daebot-"))
                    .unwrap_or(false)
        })
        .collect();

    if log_files.is_empty() {
        return Err("No log files found".to_string());
    }

    // Sort by modification time, most recent first
    log_files.sort_by_key(|entry| {
        entry.metadata().ok()
            .and_then(|m| m.modified().ok())
            .map(|t| std::cmp::Reverse(t))
    });

    Ok(log_files[0].path())
}

#[tauri::command]
fn get_last_sync_time(app: tauri::AppHandle) -> Result<Option<String>, String> {
    println!("get_last_sync_time called");

    // Get app data directory
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db_path = app_dir.join("data").join("mythic_runs.db");

    println!("Database path: {:?}", db_path);

    if !db_path.exists() {
        println!("Database does not exist yet");
        return Ok(None);
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable WAL mode to read from the WAL file (same as Node.js bot)
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;
    println!("WAL mode enabled for reading");

    // Migrate sync_history table if it exists with old schema
    let table_exists: Result<i64, rusqlite::Error> = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_history'",
        [],
        |row| row.get(0)
    );

    if let Ok(1) = table_exists {
        // Check if sync_type column exists
        let has_sync_type: Result<i64, rusqlite::Error> = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('sync_history') WHERE name='sync_type'",
            [],
            |row| row.get(0)
        );

        if let Ok(0) = has_sync_type {
            println!("Migrating sync_history table to add missing columns...");
            // Add missing columns from old schema to new schema
            let _ = conn.execute("ALTER TABLE sync_history ADD COLUMN sync_type TEXT NOT NULL DEFAULT 'auto'", []);
            let _ = conn.execute("ALTER TABLE sync_history ADD COLUMN duration_ms INTEGER", []);

            // Rename columns if needed - SQLite doesn't support RENAME COLUMN in older versions
            // So we'll check if we need to migrate data
            let has_error_message: Result<i64, rusqlite::Error> = conn.query_row(
                "SELECT COUNT(*) FROM pragma_table_info('sync_history') WHERE name='error_message'",
                [],
                |row| row.get(0)
            );

            if let Ok(0) = has_error_message {
                // Old schema detected - need to recreate table
                println!("Old schema detected - recreating sync_history table with new schema...");
                conn.execute("ALTER TABLE sync_history RENAME TO sync_history_old", [])
                    .map_err(|e| format!("Failed to rename old table: {}", e))?;

                conn.execute(
                    "CREATE TABLE sync_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp INTEGER NOT NULL,
                        sync_type TEXT NOT NULL DEFAULT 'auto',
                        runs_added INTEGER NOT NULL DEFAULT 0,
                        characters_processed INTEGER NOT NULL DEFAULT 0,
                        duration_ms INTEGER,
                        success INTEGER NOT NULL DEFAULT 1,
                        error_message TEXT
                    )",
                    [],
                ).map_err(|e| format!("Failed to create new table: {}", e))?;

                // Copy data from old table to new table
                conn.execute(
                    "INSERT INTO sync_history (id, timestamp, success, runs_added, characters_processed, duration_ms, error_message)
                     SELECT id, timestamp, success, COALESCE(runs_added, 0), COALESCE(characters_processed, 0), duration, error
                     FROM sync_history_old",
                    [],
                ).map_err(|e| format!("Failed to migrate data: {}", e))?;

                // Drop old table
                conn.execute("DROP TABLE sync_history_old", [])
                    .map_err(|e| format!("Failed to drop old table: {}", e))?;

                println!("Migration completed successfully!");
            }
        }
    }

    // Check if sync_history table exists
    let table_exists: Result<i64, rusqlite::Error> = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_history'",
        [],
        |row| row.get(0)
    );

    match table_exists {
        Ok(count) if count == 0 => {
            println!("sync_history table does not exist yet - waiting for migration");
            return Ok(None);
        }
        Err(e) => {
            println!("Error checking for table existence: {}", e);
            return Err(format!("Failed to check table existence: {}", e));
        }
        _ => {}
    }

    // First, check what's actually in the table for debugging
    let total_count: Result<i64, rusqlite::Error> = conn.query_row(
        "SELECT COUNT(*) FROM sync_history",
        [],
        |row| row.get(0)
    );
    println!("Total sync_history entries: {:?}", total_count);

    let success_count: Result<i64, rusqlite::Error> = conn.query_row(
        "SELECT COUNT(*) FROM sync_history WHERE success = 1",
        [],
        |row| row.get(0)
    );
    println!("Successful sync entries: {:?}", success_count);

    // Show all entries for debugging
    let mut stmt = conn.prepare("SELECT id, timestamp, sync_type, success FROM sync_history ORDER BY timestamp DESC LIMIT 5")
        .map_err(|e| format!("Failed to prepare debug query: {}", e))?;
    let rows = stmt.query_map([], |row| {
        Ok(format!("id={}, timestamp={}, sync_type={}, success={}",
            row.get::<_, i64>(0).unwrap_or(-1),
            row.get::<_, i64>(1).unwrap_or(-1),
            row.get::<_, String>(2).unwrap_or_else(|_| "?".to_string()),
            row.get::<_, i64>(3).unwrap_or(-1)
        ))
    });
    println!("Recent sync_history entries:");
    if let Ok(rows) = rows {
        for row in rows {
            if let Ok(row_str) = row {
                println!("  {}", row_str);
            }
        }
    }

    // Query the last successful sync time from sync_history table
    let result: Result<i64, rusqlite::Error> = conn.query_row(
        "SELECT timestamp FROM sync_history WHERE success = 1 ORDER BY timestamp DESC LIMIT 1",
        [],
        |row| row.get(0)
    );

    match result {
        Ok(timestamp) => {
            println!("Found last sync timestamp: {}", timestamp);
            // Convert millisecond timestamp to ISO 8601 string
            let dt = DateTime::from_timestamp_millis(timestamp).unwrap_or_default();
            let iso_time = dt.to_rfc3339();
            println!("Converted to ISO 8601: {}", iso_time);
            Ok(Some(iso_time))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            println!("No sync entries found with success=1");
            Ok(None)
        }
        Err(e) => {
            println!("Database query error: {}", e);
            Err(format!("Database query failed: {}", e))
        }
    }
}

#[tauri::command]
fn get_stats(app: tauri::AppHandle, season: Option<String>) -> Result<Stats, String> {
    println!("get_stats called with season: {:?}", season);

    // Get project root directory
    let app_dir = app.path().app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db_path = app_dir.join("data").join("mythic_runs.db");

    println!("Looking for database: {:?}", db_path);

    if !db_path.exists() {
        return Ok(Stats {
            total_runs: 0,
            total_characters: 0,
            last_sync: None,
            database_size: 0,
        });
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable WAL mode to read from the WAL file
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    // Build queries with optional season filter
    let (runs_query, chars_query) = if let Some(ref s) = season {
        (
            format!("SELECT COUNT(*) FROM mythic_runs WHERE season = '{}'", s),
            format!("SELECT COUNT(DISTINCT character_id) FROM mythic_runs WHERE season = '{}'", s)
        )
    } else {
        (
            "SELECT COUNT(*) FROM mythic_runs".to_string(),
            "SELECT COUNT(DISTINCT character_id) FROM mythic_runs".to_string()
        )
    };

    // Get total runs (filtered by season if specified)
    let total_runs: i64 = conn.query_row(
        &runs_query,
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    // Get total characters (filtered by season if specified)
    let total_characters: i64 = conn.query_row(
        &chars_query,
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    // Get last sync time (most recent run completion)
    let last_sync: Option<i64> = conn.query_row(
        "SELECT MAX(completed_timestamp) FROM mythic_runs",
        [],
        |row| row.get(0)
    ).ok().flatten();

    let last_sync_str = last_sync.map(|ts| {
        let dt = DateTime::from_timestamp_millis(ts).unwrap_or_default();
        dt.to_rfc3339()
    });

    // Get database size
    let metadata = fs::metadata(&db_path)
        .map_err(|e| format!("Failed to get database size: {}", e))?;
    let database_size = metadata.len();

    Ok(Stats {
        total_runs,
        total_characters,
        last_sync: last_sync_str,
        database_size,
    })
}

#[tauri::command]
fn get_sync_history(app: tauri::AppHandle, limit: Option<usize>) -> Result<Vec<SyncHistoryEntry>, String> {
    println!("get_sync_history called with limit: {:?}", limit);

    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db_path = app_dir.join("data").join("mythic_runs.db");

    println!("Looking for database: {:?}", db_path);

    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable WAL mode to read from the WAL file
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    // Create sync_history table if it doesn't exist (must match Node.js schema)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            sync_type TEXT NOT NULL DEFAULT 'auto',
            runs_added INTEGER NOT NULL DEFAULT 0,
            characters_processed INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER,
            success INTEGER NOT NULL DEFAULT 1,
            error_message TEXT
        )",
        [],
    ).map_err(|e| format!("Failed to create sync_history table: {}", e))?;

    let limit = limit.unwrap_or(4);

    // Query sync history
    let mut stmt = conn.prepare(
        "SELECT timestamp, success, sync_type, runs_added, characters_processed, duration_ms, error_message
         FROM sync_history
         ORDER BY timestamp DESC
         LIMIT ?1"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let history_iter = stmt.query_map([limit], |row| {
        // Convert INTEGER timestamp (milliseconds) to ISO 8601 string
        let timestamp_ms: i64 = row.get(0)?;
        let dt = DateTime::from_timestamp_millis(timestamp_ms).unwrap_or_default();
        let timestamp_str = dt.to_rfc3339();

        Ok(SyncHistoryEntry {
            timestamp: timestamp_str,
            success: row.get::<_, i64>(1)? != 0,
            sync_type: row.get(2)?,
            runs_added: row.get(3)?,
            characters_processed: row.get(4)?,
            duration: row.get(5)?,
            error: row.get(6)?,
        })
    }).map_err(|e| format!("Failed to query sync history: {}", e))?;

    let mut history = Vec::new();
    for entry in history_iter {
        history.push(entry.map_err(|e| format!("Failed to read history entry: {}", e))?);
    }

    Ok(history)
}

#[tauri::command]
fn add_sync_history(app: tauri::AppHandle, entry: SyncHistoryEntry) -> Result<(), String> {
    println!("add_sync_history called");

    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let data_dir = app_dir.join("data");
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;

    let db_path = data_dir.join("mythic_runs.db");

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable WAL mode to read from the WAL file
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    // Create sync_history table if it doesn't exist (must match Node.js schema)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            sync_type TEXT NOT NULL DEFAULT 'auto',
            runs_added INTEGER NOT NULL DEFAULT 0,
            characters_processed INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER,
            success INTEGER NOT NULL DEFAULT 1,
            error_message TEXT
        )",
        [],
    ).map_err(|e| format!("Failed to create sync_history table: {}", e))?;

    // Convert ISO 8601 timestamp string to milliseconds integer
    let timestamp_ms = DateTime::parse_from_rfc3339(&entry.timestamp)
        .map(|dt| dt.timestamp_millis())
        .unwrap_or_else(|_| {
            // Fallback to current time if parsing fails
            chrono::Utc::now().timestamp_millis()
        });

    // Insert the entry
    conn.execute(
        "INSERT INTO sync_history (timestamp, sync_type, runs_added, characters_processed, duration_ms, success, error_message)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            timestamp_ms,
            &entry.sync_type,
            entry.runs_added.unwrap_or(0),
            entry.characters_processed.unwrap_or(0),
            entry.duration,
            if entry.success { 1 } else { 0 },
            entry.error,
        ),
    ).map_err(|e| format!("Failed to insert sync history: {}", e))?;

    println!("Sync history entry added successfully");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState {
        bot: Mutex::new(BotState {
            process: None,
            status: "stopped".to_string(),
        }),
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Initialize updater plugin (only in release builds)
      if !cfg!(debug_assertions) {
        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      }

      // Initialize single-instance plugin to prevent multiple app instances
      app.handle().plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        println!("Second instance detected, focusing existing window");

        // Bring existing window to front
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.show();
          let _ = window.set_focus();
          let _ = window.unminimize();
        }
      }))?;

      // Initialize dialog plugin for file/folder pickers
      app.handle().plugin(tauri_plugin_dialog::init())?;

      // Initialize AppData directory and files on first run
      let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

      // Create AppData directory if it doesn't exist
      if let Err(e) = fs::create_dir_all(&app_dir) {
        println!("Warning: Failed to create app data dir: {}", e);
      } else {
        println!("AppData directory initialized: {:?}", app_dir);

        // Create blank config.json if it doesn't exist
        let config_path = app_dir.join("config.json");
        if !config_path.exists() {
          let blank_config = Config {
            token: None,
            client_id: String::new(),
            guild_id: String::new(),
            token_channel: String::new(),
            characters: Vec::new(),
          };
          if let Ok(content) = serde_json::to_string_pretty(&blank_config) {
            if let Err(e) = fs::write(&config_path, content) {
              println!("Warning: Failed to create blank config: {}", e);
            } else {
              println!("Created blank config.json at {:?}", config_path);
            }
          }
        }

        // Create blank .env if it doesn't exist
        let env_path = app_dir.join(".env");
        if !env_path.exists() {
          let blank_env = "BLIZZARD_CLIENT_ID=\nBLIZZARD_CLIENT_SECRET=\n";
          if let Err(e) = fs::write(&env_path, blank_env) {
            println!("Warning: Failed to create blank .env: {}", e);
          } else {
            println!("Created blank .env at {:?}", env_path);
          }
        }

        // Copy command files from bundled resources to AppData if they don't exist
        let commands_dir = app_dir.join("commands");
        if !commands_dir.exists() {
          println!("Commands folder not found in AppData, copying command files from resources...");

          // Get the resource path where bundled files are stored
          if let Ok(resource_path) = app.path().resource_dir() {
            println!("Resource directory: {:?}", resource_path);

            // Commands are bundled in _up_/dist/commands subdirectory
            let source_commands_path = resource_path.join("_up_").join("dist").join("commands");
            println!("Looking for command files at: {:?}", source_commands_path);

            if source_commands_path.exists() {
              // Create commands directory
              if let Err(e) = fs::create_dir_all(&commands_dir) {
                println!("Warning: Failed to create commands directory: {}", e);
              } else {
                // Copy all .js files from bundled commands to AppData commands directory
                let mut copied_count = 0;
                if let Ok(entries) = fs::read_dir(&source_commands_path) {
                  for entry in entries.flatten() {
                    let file_name = entry.file_name();
                    if let Some(name_str) = file_name.to_str() {
                      if name_str.ends_with(".js") {
                        let source_file = source_commands_path.join(&file_name);
                        let dest_file = commands_dir.join(&file_name);

                        match fs::copy(&source_file, &dest_file) {
                          Ok(_) => {
                            println!("  Copied: {:?}", file_name);
                            copied_count += 1;
                          }
                          Err(e) => println!("  Warning: Failed to copy {:?}: {}", file_name, e),
                        }
                      }
                    }
                  }
                }

                if copied_count > 0 {
                  println!("Successfully copied {} command file(s) to AppData: {:?}", copied_count, commands_dir);
                } else {
                  println!("Warning: No .js command files found in bundled resources");
                }
              }
            } else {
              println!("Warning: Commands not found at: {:?}", source_commands_path);
            }
          } else {
            println!("Warning: Could not get resource directory");
          }
        } else {
          println!("Commands folder already exists in AppData: {:?}", commands_dir);
        }
      }

      // Setup system tray
      let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
      let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

      let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .icon(app.default_window_icon().unwrap().clone())
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          "quit" => {
            // Stop bot before quitting
            if let Some(state) = app.try_state::<AppState>() {
              let mut bot = state.bot.lock().unwrap();
              if let Some(process) = bot.process.take() {
                println!("Stopping bot process from tray quit...");
                #[cfg(target_os = "windows")]
                {
                  let pid = process.id();
                  let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .output();
                }
                #[cfg(not(target_os = "windows"))]
                {
                  let _ = process.kill();
                }
              }
            }
            app.exit(0);
          }
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
            let app = tray.app_handle();
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
        })
        .build(app)?;

      // Check for --minimized argument and settings for startup behavior
      let args: Vec<String> = std::env::args().collect();
      let is_minimized_arg = args.iter().any(|arg| arg == "--minimized");

      // Load settings to check startup options
      let settings = match get_settings(app.handle().clone()) {
          Ok(s) => s,
          Err(e) => {
              println!("Warning: Failed to load settings: {}", e);
              Settings {
                  first_run: true,
                  auto_start: false,
                  minimize_to_tray: true,
                  start_minimized: false,
                  open_on_startup: false,
                  auto_start_bot: false,
              }
          }
      };

      // Handle window visibility based on settings and arguments
      if is_minimized_arg || settings.start_minimized {
          if let Some(window) = app.get_webview_window("main") {
              let _ = window.hide();
              println!("Started minimized to tray");
          }
      }

      // Auto-start bot if enabled
      if settings.auto_start_bot {
          println!("Auto-starting bot...");
          let app_handle = app.handle().clone();
          tauri::async_runtime::spawn(async move {
              // Small delay to ensure everything is initialized
              std::thread::sleep(std::time::Duration::from_secs(2));

              // Access state and app handle from within the task
              if let Some(state) = app_handle.try_state::<AppState>() {
                  match start_bot(state, app_handle.clone()) {
                      Ok(_) => println!("Bot auto-started successfully"),
                      Err(e) => println!("Failed to auto-start bot: {}", e),
                  }
              }
          });
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        // Prevent window from closing and hide it instead
        window.hide().unwrap();
        api.prevent_close();
      }
    })
    .invoke_handler(tauri::generate_handler![
        get_settings,
        save_settings,
        get_config,
        save_config,
        start_bot,
        stop_bot,
        get_bot_status,
        quit_app,
        check_for_updates,
        install_update,
        get_app_version,
        get_logs,
        get_startup_error,
        get_last_sync_time,
        get_stats,
        get_available_seasons,
        get_blizzard_credentials,
        save_blizzard_credentials,
        import_database,
        get_sync_history,
        add_sync_history,
        get_bot_settings,
        update_bot_settings,
        deploy_discord_commands,
        delete_discord_commands,
        copy_commands_folder
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
