/**
 * Application Paths Utility
 *
 * Centralized module for getting AppData paths used by the bot.
 * Ensures consistent path resolution across all modules.
 *
 * Automatically detects if running from Tauri app or standalone (dev mode):
 * - Tauri app: Uses AppData directory
 * - Standalone: Uses project root directory
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Detect if the bot is running from within the Tauri app
 * @returns {boolean} True if running from Tauri app, false if standalone
 */
function isRunningFromTauriApp() {
    // Check if environment variables are set by Tauri (used for deploy-commands.js)
    // When Tauri spawns node processes, it sets these environment variables
    if (process.env.DISCORD_CLIENT_ID || process.env.DISCORD_GUILD_ID) {
        return true;
    }

    // Check if we're running as a compiled executable (bot.exe)
    // and if the executable is in a typical Tauri app location
    const exePath = process.execPath;

    // If running via node (not compiled), check working directory
    if (exePath.includes('node.exe') || exePath.includes('node')) {
        // If cwd is in Program Files or contains DaeBot.exe, we're from Tauri
        const cwd = process.cwd();
        if (cwd.includes('Program Files') || cwd.includes('DaeBot')) {
            // Additional check: see if DaeBot.exe exists in parent directories
            const parts = cwd.split(path.sep);
            for (let i = parts.length - 1; i >= 0; i--) {
                const testPath = parts.slice(0, i + 1).join(path.sep);
                if (fs.existsSync(path.join(testPath, 'DaeBot.exe'))) {
                    return true;
                }
            }
        }
        return false;
    }

    // If bot.exe is in Program Files or AppData, it's from Tauri
    if (exePath.includes('Program Files') || exePath.includes('AppData')) {
        return true;
    }

    // If there's a parent directory called DaeBot with DaeBot.exe, we're from Tauri
    const parentDir = path.dirname(exePath);
    const grandParentDir = path.dirname(parentDir);

    if (fs.existsSync(path.join(parentDir, 'DaeBot.exe')) ||
        fs.existsSync(path.join(grandParentDir, 'DaeBot.exe'))) {
        return true;
    }

    return false;
}

/**
 * Get the base AppData directory for the current platform
 * @returns {string} AppData directory path
 */
function getAppDataPath() {
    if (process.env.APPDATA) {
        // Windows
        return process.env.APPDATA;
    } else if (process.platform === 'darwin') {
        // macOS
        return path.join(os.homedir(), 'Library', 'Application Support');
    } else {
        // Linux and others
        return path.join(os.homedir(), '.local', 'share');
    }
}

/**
 * Get the DaeBot application data directory
 * @returns {string} DaeBot AppData directory path
 */
function getDaeBotAppData() {
    return path.join(getAppDataPath(), 'com.daebot.app');
}

/**
 * Get the project root directory (for standalone mode)
 * @returns {string} Project root directory
 */
function getProjectRoot() {
    // When running standalone, __dirname will be in utils/
    // Go up one level to get project root
    return path.join(__dirname, '..');
}

/**
 * Get the config.json file path
 * @returns {string} config.json file path
 */
function getConfigPath() {
    if (isRunningFromTauriApp()) {
        return path.join(getDaeBotAppData(), 'config.json');
    } else {
        return path.join(getProjectRoot(), 'config.json');
    }
}

/**
 * Get the .env file path
 * @returns {string} .env file path
 */
function getEnvPath() {
    if (isRunningFromTauriApp()) {
        return path.join(getDaeBotAppData(), '.env');
    } else {
        return path.join(getProjectRoot(), '.env');
    }
}

/**
 * Get the data directory path (for database and other data files)
 * @returns {string} data directory path
 */
function getDataPath() {
    if (isRunningFromTauriApp()) {
        return path.join(getDaeBotAppData(), 'data');
    } else {
        return path.join(getProjectRoot(), 'data');
    }
}

/**
 * Get the logs directory path
 * @returns {string} logs directory path
 */
function getLogsPath() {
    if (isRunningFromTauriApp()) {
        return path.join(getDaeBotAppData(), 'logs');
    } else {
        return path.join(getProjectRoot(), 'logs');
    }
}

module.exports = {
    isRunningFromTauriApp,
    getAppDataPath,
    getDaeBotAppData,
    getProjectRoot,
    getConfigPath,
    getEnvPath,
    getDataPath,
    getLogsPath
};
