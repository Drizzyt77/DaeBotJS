/**
 * Mock API for browser testing (when not running in Electron)
 * This allows testing the React UI without Electron
 */

const mockApi = {
    // Bot controls
    startBot: async () => {
        console.log('[Mock] Starting bot...');
        return { success: true };
    },
    stopBot: async () => {
        console.log('[Mock] Stopping bot...');
        return { success: true };
    },
    restartBot: async () => {
        console.log('[Mock] Restarting bot...');
        return { success: true };
    },
    getBotStatus: async () => {
        return { isRunning: false, online: false };
    },

    // Sync controls
    forceSync: async () => {
        console.log('[Mock] Force syncing...');
        return { success: true };
    },
    forceSyncCharacter: async (characterName) => {
        console.log(`[Mock] Syncing character: ${characterName}`);
        return { success: true, result: { runsAdded: 5 } };
    },

    // Settings
    getSettings: async () => {
        return {
            syncInterval: 3600000,
            minimizeToTray: true,
            autoUpdate: true,
            firstRun: false
        };
    },
    saveSettings: async (settings) => {
        console.log('[Mock] Saving settings:', settings);
        return { success: true };
    },

    // Config
    getConfig: async () => {
        return {
            success: true,
            config: {
                token: '',
                clientId: '123456789',
                guildId: '987654321',
                tokenChannel: '',
                characters: [
                    { name: 'Daemourne', realm: 'thrall', region: 'us' },
                    { name: 'TestChar', realm: 'area-52', region: 'us' }
                ]
            }
        };
    },
    saveConfig: async (config) => {
        console.log('[Mock] Saving config:', config);
        return { success: true };
    },

    // Stats
    getStats: async () => {
        return {
            success: true,
            stats: {
                characterCount: 2,
                runs: 150,
                latest_run: new Date().toISOString(),
                db_size: 1024 * 1024 * 5 // 5 MB
            }
        };
    },

    // Event listeners (no-op in browser mode)
    onBotStatus: (callback) => {
        console.log('[Mock] Registered bot status listener');
    },
    onSyncStarted: (callback) => {
        console.log('[Mock] Registered sync started listener');
    },
    onSyncProgress: (callback) => {
        console.log('[Mock] Registered sync progress listener');
    },
    onSyncComplete: (callback) => {
        console.log('[Mock] Registered sync complete listener');
    },
    onSyncError: (callback) => {
        console.log('[Mock] Registered sync error listener');
    },
    onLogEntry: (callback) => {
        console.log('[Mock] Registered log entry listener');
        // Simulate some log entries
        setTimeout(() => {
            callback({ timestamp: Date.now(), level: 'info', message: 'Mock log entry - Bot initialized' });
        }, 1000);
        setTimeout(() => {
            callback({ timestamp: Date.now(), level: 'success', message: 'Mock log entry - Ready to go!' });
        }, 2000);
    },
    onStatsUpdated: (callback) => {
        console.log('[Mock] Registered stats updated listener');
    },
    onShowSetupWizard: (callback) => {
        console.log('[Mock] Registered setup wizard listener');
    },
    removeListener: (eventName) => {
        console.log(`[Mock] Removed listener: ${eventName}`);
    },

    completeSetup: async () => {
        console.log('[Mock] Setup completed');
        return { success: true };
    }
};

// Install mock API if not in Electron
if (!window.api) {
    console.log('%c[Mock API] Running in browser mode - using mock API', 'color: orange; font-weight: bold');
    window.api = mockApi;
}

export default mockApi;
