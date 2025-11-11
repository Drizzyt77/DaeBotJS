import { invoke } from '@tauri-apps/api/core';

// Settings API
export async function getSettings() {
    return await invoke('get_settings');
}

export async function saveSettings(settings) {
    return await invoke('save_settings', { settings });
}

// Config API
export async function getConfig() {
    return await invoke('get_config');
}

export async function saveConfig(config) {
    return await invoke('save_config', { config });
}

// Bot Control API
export async function startBot() {
    return await invoke('start_bot');
}

export async function stopBot() {
    return await invoke('stop_bot');
}

export async function getBotStatus() {
    return await invoke('get_bot_status');
}

export async function restartBot() {
    await stopBot();
    // Wait a moment before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await startBot();
}

// Sync operations removed - automatic periodic sync is sufficient

// Logs API
export async function getLogs(limit = 100) {
    return await invoke('get_logs', { limit });
}

// Startup error check
export async function getStartupError() {
    return await invoke('get_startup_error');
}

// Stats API
export async function getStats(season = null) {
    return await invoke('get_stats', { season });
}

export async function getAvailableSeasons() {
    return await invoke('get_available_seasons');
}

// App Control API
export async function quitApp() {
    return await invoke('quit_app');
}

// Update API
export async function checkForUpdates() {
    return await invoke('check_for_updates');
}

export async function installUpdate() {
    return await invoke('install_update');
}

export async function getAppVersion() {
    return await invoke('get_app_version');
}

// Blizzard API credentials
export async function getBlizzardCredentials() {
    return await invoke('get_blizzard_credentials');
}

export async function saveBlizzardCredentials(credentials) {
    return await invoke('save_blizzard_credentials', { credentials });
}

// Database import
export async function importDatabase(filePath) {
    return await invoke('import_database', { filePath });
}

// Sync history
export async function getSyncHistory(limit = 10) {
    return await invoke('get_sync_history', { limit });
}

export async function addSyncHistory(entry) {
    return await invoke('add_sync_history', { entry });
}

export async function getLastSyncTime() {
    return await invoke('get_last_sync_time');
}

// Bot Settings (Season/Dungeons Management)
export async function getBotSettings() {
    return await invoke('get_bot_settings');
}

export async function updateBotSettings(settings) {
    return await invoke('update_bot_settings', { settings });
}

// Discord command deployment
export async function deployDiscordCommands() {
    return await invoke('deploy_discord_commands');
}

export async function deleteDiscordCommands() {
    return await invoke('delete_discord_commands');
}

export async function copyCommandsFolder() {
    return await invoke('copy_commands_folder');
}

// Developer Tools
export async function insertManualRun(runData) {
    return await invoke('insert_manual_run', { runData });
}
