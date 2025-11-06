import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, getConfig, saveConfig, getAppVersion, getBlizzardCredentials, saveBlizzardCredentials, importDatabase, deployDiscordCommands, deleteDiscordCommands, copyCommandsFolder, getBotSettings, updateBotSettings } from '../tauriApi';
import useUpdateManager from '../hooks/useUpdateManager';
import { open, message, ask } from '@tauri-apps/plugin-dialog';

function SettingsPanel({ settings: initialSettings }) {
    const [settings, setSettings] = useState({
        syncInterval: 3600000,
        minimizeToTray: true,
        autoUpdate: true,
        openOnStartup: false,
        startMinimized: false,
        autoStartBot: false
    });
    const [config, setConfig] = useState({
        token: '',
        clientId: '',
        guildId: '',
        tokenChannel: '',
        characters: []
    });
    const [blizzardCreds, setBlizzardCreds] = useState({
        clientId: '',
        clientSecret: ''
    });
    const [botSettings, setBotSettings] = useState({
        seasonId: 15,
        seasonName: 'season-tww-3',
        defaultRegion: 'us',
        defaultRealm: 'thrall',
        activeDungeons: [],
        betaChannel: false
    });
    const [newDungeon, setNewDungeon] = useState('');
    const [newCharacter, setNewCharacter] = useState({
        name: '',
        realm: '',
        region: 'us'
    });
    const [activeTab, setActiveTab] = useState('general');
    const [saving, setSaving] = useState(false);
    const [appVersion, setAppVersion] = useState('');

    // Use the global update manager
    const { updateInfo, checking: checkingUpdates, checkUpdates } = useUpdateManager();

    useEffect(() => {
        loadSettings();
        loadConfig();
        loadBlizzardCreds();
        loadBotSettings();
        loadVersion();
    }, [initialSettings]);

    const loadVersion = async () => {
        try {
            const version = await getAppVersion();
            setAppVersion(version);
        } catch (error) {
            console.error('Failed to load version:', error);
        }
    };

    const loadSettings = async () => {
        try {
            const result = await getSettings();
            if (result) {
                setSettings({
                    syncInterval: result.syncInterval || 3600000,
                    minimizeToTray: result.minimizeToTray !== undefined ? result.minimizeToTray : true,
                    autoUpdate: result.autoUpdate !== undefined ? result.autoUpdate : true,
                    openOnStartup: result.openOnStartup !== undefined ? result.openOnStartup : false,
                    startMinimized: result.startMinimized !== undefined ? result.startMinimized : false,
                    autoStartBot: result.autoStartBot !== undefined ? result.autoStartBot : false,
                });
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    };

    const loadConfig = async () => {
        try {
            const result = await getConfig();
            if (result) {
                setConfig({
                    token: '', // Never load token for security
                    clientId: result.clientId || '',
                    guildId: result.guildId || '',
                    tokenChannel: result.tokenChannel || '',
                    characters: result.characters || []
                });
            }
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    };

    const loadBlizzardCreds = async () => {
        try {
            const result = await getBlizzardCredentials();
            if (result) {
                setBlizzardCreds({
                    clientId: result.clientId || '',
                    clientSecret: result.clientSecret || ''
                });
            }
        } catch (error) {
            console.error('Failed to load Blizzard credentials:', error);
        }
    };

    const loadBotSettings = async () => {
        try {
            const result = await getBotSettings();
            if (result) {
                setBotSettings({
                    seasonId: result.seasonId || 15,
                    seasonName: result.seasonName || 'season-tww-3',
                    defaultRegion: result.defaultRegion || 'us',
                    defaultRealm: result.defaultRealm || 'thrall',
                    activeDungeons: result.activeDungeons || []
                });
            }
        } catch (error) {
            console.error('Failed to load bot settings:', error);
        }
    };

    const handleSaveBotSettings = async () => {
        try {
            setSaving(true);

            // Validate season name format
            if (!botSettings.seasonName.startsWith('season-')) {
                await message('Season name must start with "season-" (e.g., season-mid-1)', {
                    title: 'Invalid Season Name',
                    kind: 'error'
                });
                return;
            }

            // Validate season ID
            if (botSettings.seasonId < 1 || botSettings.seasonId > 100) {
                await message('Season ID must be between 1 and 100', {
                    title: 'Invalid Season ID',
                    kind: 'error'
                });
                return;
            }

            await updateBotSettings(botSettings);
            await message('Season settings saved successfully! The bot will use these settings for all future syncs.', {
                title: 'Settings Saved',
                kind: 'info'
            });
        } catch (error) {
            console.error('Failed to save bot settings:', error);
            await message('Failed to save season settings: ' + error, {
                title: 'Error',
                kind: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleAddDungeon = () => {
        if (newDungeon.trim()) {
            setBotSettings(prev => ({
                ...prev,
                activeDungeons: [...prev.activeDungeons, newDungeon.trim()]
            }));
            setNewDungeon('');
        }
    };

    const handleRemoveDungeon = (index) => {
        setBotSettings(prev => ({
            ...prev,
            activeDungeons: prev.activeDungeons.filter((_, i) => i !== index)
        }));
    };

    const handleSaveBlizzardCreds = async () => {
        try {
            setSaving(true);
            await saveBlizzardCredentials(blizzardCreds);
            await message('Blizzard API credentials saved successfully! Please restart the bot for changes to take effect.', { title: 'DaeBot', kind: 'info' });
        } catch (error) {
            await message('Failed to save Blizzard credentials: ' + error.message, { title: 'DaeBot', kind: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveSettings = async () => {
        try {
            setSaving(true);
            await saveSettings(settings);
            // Also save bot settings (for beta channel preference)
            await updateBotSettings(botSettings);
            await message('Settings saved successfully!', { title: 'DaeBot', kind: 'info' });
        } catch (error) {
            await message('Failed to save settings: ' + error.message, { title: 'DaeBot', kind: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveConfig = async () => {
        try {
            setSaving(true);

            // Only include token if it was actually changed
            const configToSave = {
                clientId: config.clientId,
                guildId: config.guildId,
                tokenChannel: config.tokenChannel,
                characters: config.characters
            };

            if (config.token) {
                configToSave.token = config.token;
            }

            console.log('[SettingsPanel] Saving config:', configToSave);
            await saveConfig(configToSave);
            console.log('[SettingsPanel] Config saved successfully');
            await message('Configuration saved successfully! Please restart the bot for changes to take effect.', { title: 'DaeBot', kind: 'info' });
            // Clear token field after saving
            setConfig(prev => ({ ...prev, token: '' }));
        } catch (error) {
            console.error('[SettingsPanel] Error saving config:', error);
            console.error('[SettingsPanel] Error type:', typeof error);
            console.error('[SettingsPanel] Error stringified:', JSON.stringify(error));
            const errorMsg = typeof error === 'string' ? error : (error?.message || String(error) || 'Unknown error');
            await message('Failed to save configuration: ' + errorMsg, { title: 'DaeBot', kind: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleAddCharacter = () => {
        if (!newCharacter.name || !newCharacter.realm) {
            return;
        }

        setConfig(prev => ({
            ...prev,
            characters: [
                ...prev.characters,
                {
                    name: newCharacter.name.trim(),
                    realm: newCharacter.realm.trim().toLowerCase(),
                    region: newCharacter.region
                }
            ]
        }));

        setNewCharacter({ name: '', realm: '', region: 'us' });
    };

    const handleRemoveCharacter = async (index) => {
        const confirmed = await ask('Are you sure you want to remove this character?', { title: 'DaeBot', kind: 'warning' });
        if (confirmed) {
            setConfig(prev => ({
                ...prev,
                characters: prev.characters.filter((_, i) => i !== index)
            }));
        }
    };

    const handleExportConfig = () => {
        const exportData = {
            clientId: config.clientId,
            guildId: config.guildId,
            tokenChannel: config.tokenChannel,
            characters: config.characters,
            // Note: token is intentionally excluded from export
        };

        const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `daebot-config-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportConfig = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const importedConfig = JSON.parse(text);

            setConfig(prev => ({
                ...prev,
                clientId: importedConfig.clientId || prev.clientId,
                guildId: importedConfig.guildId || prev.guildId,
                tokenChannel: importedConfig.tokenChannel || prev.tokenChannel,
                characters: importedConfig.characters || prev.characters
            }));

            await message('Configuration imported successfully. Review and save to apply changes.', { title: 'DaeBot', kind: 'info' });
        } catch (error) {
            await message('Failed to import configuration: ' + error.message, { title: 'DaeBot', kind: 'error' });
        }
    };

    const handleImportDatabase = async () => {
        try {
            // Use Tauri dialog to select database file
            const filePath = await open({
                title: 'Select Database File',
                filters: [{
                    name: 'Database',
                    extensions: ['db']
                }],
                multiple: false,
                directory: false
            });

            console.log('[SettingsPanel] File dialog result:', filePath);

            if (!filePath) {
                // User cancelled
                console.log('[SettingsPanel] User cancelled file selection');
                return;
            }

            setSaving(true);
            console.log('[SettingsPanel] Importing database from:', filePath);
            const result = await importDatabase(filePath);
            console.log('[SettingsPanel] Import result:', result);
            await message(result, { title: 'DaeBot', kind: 'info' });
        } catch (error) {
            console.error('[SettingsPanel] Database import error:', error);
            console.error('[SettingsPanel] Error type:', typeof error);
            console.error('[SettingsPanel] Error stringified:', JSON.stringify(error));
            const errorMsg = typeof error === 'string' ? error : (error?.message || String(error) || 'Unknown error');
            await message('Failed to import database: ' + errorMsg, { title: 'DaeBot', kind: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleCheckForUpdates = async () => {
        try {
            // Force show the update notification even if previously dismissed
            const result = await checkUpdates(true);
            if (result.available) {
                await message(`Update available: v${result.version}\n\nThe update notification will appear at the top of the window.`, { title: 'DaeBot', kind: 'info' });
            } else {
                await message('You are running the latest version!', { title: 'DaeBot', kind: 'info' });
            }
        } catch (error) {
            console.error('Failed to check for updates:', error);
            await message('Failed to check for updates: ' + error.message, { title: 'DaeBot', kind: 'error' });
        }
    };

    const handleDeployCommands = async () => {
        try {
            setSaving(true);
            const result = await deployDiscordCommands();
            await message(result, { title: 'DaeBot', kind: 'info' });
        } catch (error) {
            console.error('Failed to deploy commands:', error);
            const errorMsg = typeof error === 'string' ? error : (error?.message || String(error) || 'Unknown error');
            await message('Failed to deploy commands:\n\n' + errorMsg, { title: 'DaeBot', kind: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteCommands = async () => {
        const confirmed = await ask('Are you sure you want to delete all Discord commands?\n\nThis will remove all slash commands from your Discord server.', { title: 'DaeBot', kind: 'warning' });
        if (!confirmed) return;

        try {
            setSaving(true);
            const result = await deleteDiscordCommands();
            await message(result, { title: 'DaeBot', kind: 'info' });
        } catch (error) {
            console.error('Failed to delete commands:', error);
            const errorMsg = typeof error === 'string' ? error : (error?.message || String(error) || 'Unknown error');
            await message('Failed to delete commands:\n\n' + errorMsg, { title: 'DaeBot', kind: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleCopyCommandsFolder = async () => {
        try {
            setSaving(true);
            const result = await copyCommandsFolder();
            await message(result, { title: 'DaeBot', kind: 'info' });
        } catch (error) {
            console.error('Failed to copy commands folder:', error);
            const errorMsg = typeof error === 'string' ? error : (error?.message || String(error) || 'Unknown error');
            await message('Failed to copy commands folder:\n\n' + errorMsg, { title: 'DaeBot', kind: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="settings-panel">
            {/* Tabs */}
            <div className="settings-tabs">
                <button
                    className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
                    onClick={() => setActiveTab('general')}
                >
                    General
                </button>
                <button
                    className={`settings-tab ${activeTab === 'discord' ? 'active' : ''}`}
                    onClick={() => setActiveTab('discord')}
                >
                    Discord Bot
                </button>
                <button
                    className={`settings-tab ${activeTab === 'characters' ? 'active' : ''}`}
                    onClick={() => setActiveTab('characters')}
                >
                    Characters
                </button>
                <button
                    className={`settings-tab ${activeTab === 'season' ? 'active' : ''}`}
                    onClick={() => setActiveTab('season')}
                >
                    Season Management
                </button>
            </div>

            {/* General Settings */}
            {activeTab === 'general' && (
                <div className="settings-section">
                    <h3>General Settings</h3>

                    <div className="form-group sync-interval-group">
                        <label htmlFor="syncInterval">Auto-sync Interval</label>
                        <select
                            id="syncInterval"
                            className="input"
                            value={settings.syncInterval}
                            onChange={(e) => setSettings({ ...settings, syncInterval: Number(e.target.value) })}
                        >
                            <option value={900000}>Every 15 minutes</option>
                            <option value={1800000}>Every 30 minutes</option>
                            <option value={3600000}>Every 1 hour</option>
                            <option value={7200000}>Every 2 hours</option>
                            <option value={14400000}>Every 4 hours</option>
                            <option value={28800000}>Every 8 hours</option>
                            <option value={86400000}>Every 24 hours</option>
                        </select>
                        <small className="tooltip" style={{ display: 'block', marginTop: '0.5rem' }}>How often the bot automatically syncs character data</small>
                    </div>

                    <div className="form-group">
                        <label className="checkbox-label">
                            <input className="checkbox-input"
                                type="checkbox"
                                checked={settings.minimizeToTray}
                                onChange={(e) => setSettings({ ...settings, minimizeToTray: e.target.checked })}
                            />
                            Minimize to system tray
                        </label>
                        <small className="tooltip" style={{ display: 'block', marginTop: '0.5rem' }}>When enabled, closing the window minimizes to tray instead of quitting</small>
                    </div>

                    <div className="form-group">
                        <label className="checkbox-label">
                            <input className="checkbox-input"
                                type="checkbox"
                                checked={settings.autoUpdate}
                                onChange={(e) => setSettings({ ...settings, autoUpdate: e.target.checked })}
                            />
                            Enable auto-updates
                        </label>
                        <small className="tooltip" style={{ display: 'block', marginTop: '0.5rem' }}>Automatically download and install updates from GitHub</small>
                    </div>

                    <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid var(--border)' }} />

                    <h3>Startup Behavior</h3>

                    <div className="form-group">
                        <label className="checkbox-label">
                            <input className="checkbox-input"
                                type="checkbox"
                                checked={settings.openOnStartup}
                                onChange={(e) => setSettings({ ...settings, openOnStartup: e.target.checked })}
                            />
                            Open on Windows startup
                        </label>
                        <small className="tooltip" style={{ display: 'block', marginTop: '0.5rem' }}>Automatically launch DaeBot when Windows starts</small>
                    </div>

                    <div className="form-group">
                        <label className="checkbox-label">
                            <input className="checkbox-input"
                                type="checkbox"
                                checked={settings.startMinimized}
                                onChange={(e) => setSettings({ ...settings, startMinimized: e.target.checked })}
                            />
                            Start minimized to tray
                        </label>
                        <small className="tooltip" style={{ display: 'block', marginTop: '0.5rem' }}>Open minimized to system tray on startup</small>
                    </div>

                    <div className="form-group">
                        <label className="checkbox-label">
                            <input className="checkbox-input"
                                type="checkbox"
                                checked={settings.autoStartBot}
                                onChange={(e) => setSettings({ ...settings, autoStartBot: e.target.checked })}
                            />
                            Auto-start bot on launch
                        </label>
                        <small className="tooltip" style={{ display: 'block', marginTop: '0.5rem' }}>Automatically start the Discord bot when the app opens</small>
                    </div>

                    <button
                        className="btn btn-success"
                        onClick={handleSaveSettings}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>

                    <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid var(--border)' }} />

                    <h3>About</h3>
                    <div className="about-section">
                        <div className="form-group">
                            <label>Version</label>
                            <div className="info-text">v{appVersion || 'Loading...'}</div>
                        </div>

                        <div className="form-group">
                            <label className="checkbox-label">
                                <input className="checkbox-input"
                                    type="checkbox"
                                    checked={botSettings.betaChannel}
                                    onChange={(e) => setBotSettings({ ...botSettings, betaChannel: e.target.checked })}
                                />
                                Enable Beta Channel
                            </label>
                            <small className="tooltip" style={{ display: 'block', marginTop: '0.5rem' }}>
                                Receive beta/pre-release updates for testing new features before stable releases.
                            </small>
                        </div>

                        <div className="form-group">
                            <label>Updates</label>
                            <button class="update-btn"
                                className="btn btn-primary"
                                onClick={handleCheckForUpdates}
                                disabled={checkingUpdates}
                            >
                                {checkingUpdates ? 'Checking...' : 'Check for Updates'}
                            </button>
                            {updateInfo && (
                                <small style={{ display: 'block', marginTop: '0.5rem' }}>
                                    {updateInfo.available
                                        ? `New version available: v${updateInfo.version}`
                                        : 'You are up to date!'}
                                </small>
                            )}
                        </div>

                        <div className="form-group">
                            <label>Application</label>
                            <div className="info-text">DaeBot - WoW Character Manager</div>
                            <small className="tooltip" style={{ display: 'block', marginTop: '0.5rem' }}>Automate Discord bot for World of Warcraft Mythic+ tracking</small>
                        </div>
                    </div>
                </div>
            )}

            {/* Discord Bot Settings */}
            {activeTab === 'discord' && (
                <div className="settings-section">
                    <h3>Discord Bot Configuration</h3>

                    <div className="form-group">
                        <label htmlFor="token">Bot Token</label>
                        <input
                            id="token"
                            type="password"
                            className="input"
                            placeholder="Leave empty to keep current token"
                            value={config.token}
                            onChange={(e) => setConfig({ ...config, token: e.target.value })}
                        />
                        <small className="tooltip" style={{ display: 'block', marginTop: '0.5rem' }}>Your Discord bot token. Leave empty to keep current token.</small>
                    </div>

                    <div className="form-group">
                        <label htmlFor="clientId">Client ID</label>
                        <input
                            id="clientId"
                            type="text"
                            className="input"
                            placeholder="Your bot's client ID"
                            value={config.clientId}
                            onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="guildId">Guild ID</label>
                        <input
                            id="guildId"
                            type="text"
                            className="input"
                            placeholder="Your Discord server ID"
                            value={config.guildId}
                            onChange={(e) => setConfig({ ...config, guildId: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="tokenChannel">WoW Token Channel ID (optional)</label>
                        <input
                            id="tokenChannel"
                            type="text"
                            className="input"
                            placeholder="Channel for WoW token updates"
                            value={config.tokenChannel}
                            onChange={(e) => setConfig({ ...config, tokenChannel: e.target.value })}
                        />
                    </div>

                    <div className="button-group" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-success"
                            onClick={handleSaveConfig}
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </button>

                        <button
                            className="btn btn-secondary"
                            onClick={handleExportConfig}
                        >
                            Export Config
                        </button>

                        <label htmlFor="import-config" className="btn btn-secondary" style={{ margin: 0 }}>
                            Import Config
                        </label>
                        <input
                            id="import-config"
                            type="file"
                            accept=".json"
                            onChange={handleImportConfig}
                            style={{ display: 'none' }}
                        />

                        <button
                            className="btn btn-secondary"
                            onClick={handleImportDatabase}
                            disabled={saving}
                        >
                            Import Database
                        </button>
                    </div>

                    <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid var(--border)' }} />

                    {/* Command Management Section */}
                    <h3>Discord Command Management</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                        Register or remove slash commands from your Discord server. Run "Deploy Commands" after adding or modifying commands.
                    </p>

                    <div className="button-group" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-primary"
                            onClick={handleDeployCommands}
                            disabled={saving}
                        >
                            {saving ? 'Deploying...' : 'Deploy Commands'}
                        </button>

                        <button
                            className="btn btn-danger"
                            onClick={handleDeleteCommands}
                            disabled={saving}
                        >
                            {saving ? 'Deleting...' : 'Delete All Commands'}
                        </button>

                        <button
                            className="btn btn-secondary"
                            onClick={handleCopyCommandsFolder}
                            disabled={saving}
                        >
                            {saving ? 'Copying...' : 'Copy Commands Folder'}
                        </button>
                    </div>

                    <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        If deploy fails, try "Copy Commands Folder" first to restore command files.
                    </small>

                    <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid var(--border)' }} />

                    <h3>Blizzard API Credentials</h3>
                    <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                        Required for accurate spec detection. Get your credentials from the <a href="https://develop.battle.net/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Blizzard Developer Portal</a>.
                    </p>

                    <div className="form-group">
                        <label htmlFor="blizzardClientId">Blizzard Client ID</label>
                        <input
                            id="blizzardClientId"
                            type="text"
                            className="input"
                            placeholder="Your Blizzard API Client ID"
                            value={blizzardCreds.clientId}
                            onChange={(e) => setBlizzardCreds({ ...blizzardCreds, clientId: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="blizzardClientSecret">Blizzard Client Secret</label>
                        <input
                            id="blizzardClientSecret"
                            type="password"
                            className="input"
                            placeholder="Your Blizzard API Client Secret"
                            value={blizzardCreds.clientSecret}
                            onChange={(e) => setBlizzardCreds({ ...blizzardCreds, clientSecret: e.target.value })}
                        />
                        <small className="tooltip" style={{ display: 'block', marginTop: '0.5rem' }}>Keep this secret! Never share it publicly.</small>
                    </div>

                    <button
                        className="btn btn-success"
                        onClick={handleSaveBlizzardCreds}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Blizzard Credentials'}
                    </button>
                </div>
            )}

            {/* Characters Settings */}
            {activeTab === 'characters' && (
                <div className="settings-section">
                    <h3>Manage Characters</h3>

                    <div className="character-input">
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="charName">Character Name</label>
                                <input
                                    id="charName"
                                    type="text"
                                    className="input"
                                    placeholder="Character name"
                                    value={newCharacter.name}
                                    onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })}
                                    onKeyPress={(e) => e.key === 'Enter' && handleAddCharacter()}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="charRealm">Realm</label>
                                <input
                                    id="charRealm"
                                    type="text"
                                    className="input"
                                    placeholder="Realm name"
                                    value={newCharacter.realm}
                                    onChange={(e) => setNewCharacter({ ...newCharacter, realm: e.target.value })}
                                    onKeyPress={(e) => e.key === 'Enter' && handleAddCharacter()}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="charRegion">Region</label>
                                <select
                                    id="charRegion"
                                    className="input"
                                    value={newCharacter.region}
                                    onChange={(e) => setNewCharacter({ ...newCharacter, region: e.target.value })}
                                >
                                    <option value="us">US</option>
                                    <option value="eu">EU</option>
                                    <option value="kr">KR</option>
                                    <option value="tw">TW</option>
                                </select>
                            </div>

                            <button
                                className="btn btn-success"
                                onClick={handleAddCharacter}
                                disabled={!newCharacter.name || !newCharacter.realm}
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    {config.characters.length > 0 ? (
                        <div className="character-list-settings">
                            <h4>Tracked Characters ({config.characters.length})</h4>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Realm</th>
                                        <th>Region</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {config.characters.map((char, index) => (
                                        <tr key={index}>
                                            <td className="character-name">{char.name}</td>
                                            <td>{char.realm}</td>
                                            <td>{char.region.toUpperCase()}</td>
                                            <td>
                                                <button
                                                    className="btn btn-danger btn-small"
                                                    onClick={() => handleRemoveCharacter(index)}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <button
                                className="btn btn-success mt-md"
                                onClick={handleSaveConfig}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Save Characters'}
                            </button>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p>No characters configured yet. Add your first character above.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Season Management */}
            {activeTab === 'season' && (
                <div className="settings-section">
                    <h3>Season Management</h3>
                    <p className="section-description">
                        Configure the current Mythic+ season settings. These settings affect data collection and filtering throughout the application.
                    </p>

                    <div className="form-section">
                        <h4>Current Season Information</h4>

                        <div className="form-group">
                            <label htmlFor="seasonId">Season ID (Blizzard API)</label>
                            <input
                                id="seasonId"
                                type="number"
                                className="input"
                                placeholder="e.g., 15"
                                value={botSettings.seasonId}
                                onChange={(e) => setBotSettings({ ...botSettings, seasonId: parseInt(e.target.value) || 0 })}
                                min="1"
                                max="100"
                            />
                            <small className="tooltip">
                                The numeric season ID used by Blizzard's API. For TWW Season 3, this is 15.
                            </small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="seasonName">Season Name (RaiderIO Format)</label>
                            <input
                                id="seasonName"
                                type="text"
                                className="input"
                                placeholder="e.g., season-tww-3 or season-mid-1"
                                value={botSettings.seasonName}
                                onChange={(e) => setBotSettings({ ...botSettings, seasonName: e.target.value })}
                            />
                            <small className="tooltip">
                                Format: season-[expansion]-[number]. Examples:
                                <br />• TWW Season 3: season-tww-3
                                <br />• Midnight Season 1: season-mid-1
                                <br />This is used for RaiderIO API calls.
                            </small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="defaultRegion">Default Region</label>
                            <select
                                id="defaultRegion"
                                className="input"
                                value={botSettings.defaultRegion}
                                onChange={(e) => setBotSettings({ ...botSettings, defaultRegion: e.target.value })}
                            >
                                <option value="us">US (Americas)</option>
                                <option value="eu">EU (Europe)</option>
                                <option value="kr">KR (Korea)</option>
                                <option value="tw">TW (Taiwan)</option>
                            </select>
                            <small className="tooltip">Default region for API calls and character lookups.</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="defaultRealm">Default Realm</label>
                            <input
                                id="defaultRealm"
                                type="text"
                                className="input"
                                placeholder="e.g., thrall"
                                value={botSettings.defaultRealm}
                                onChange={(e) => setBotSettings({ ...botSettings, defaultRealm: e.target.value.toLowerCase() })}
                            />
                            <small className="tooltip">Default realm name (lowercase, no spaces).</small>
                        </div>
                    </div>

                    <div className="form-section">
                        <h4>Active Dungeon Pool</h4>
                        <p className="section-description">
                            List the 8 dungeons active in the current Mythic+ season. This helps filter and validate data.
                        </p>

                        <div className="form-group">
                            <label>Add Dungeon</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="e.g., The Dawnbreaker"
                                    value={newDungeon}
                                    onChange={(e) => setNewDungeon(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddDungeon();
                                        }
                                    }}
                                />
                                <button
                                    className="btn btn-primary"
                                    onClick={handleAddDungeon}
                                    disabled={!newDungeon.trim()}
                                >
                                    Add
                                </button>
                            </div>
                        </div>

                        {botSettings.activeDungeons.length > 0 ? (
                            <div className="dungeon-list" style={{ marginTop: '1rem' }}>
                                <table className="character-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Dungeon Name</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {botSettings.activeDungeons.map((dungeon, index) => (
                                            <tr key={index}>
                                                <td>{index + 1}</td>
                                                <td>{dungeon}</td>
                                                <td>
                                                    <button
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleRemoveDungeon(index)}
                                                    >
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="empty-state">
                                <p>No dungeons configured. Add dungeons above (typically 8 for a season).</p>
                            </div>
                        )}
                    </div>

                    <div className="form-actions">
                        <button
                            className="btn btn-success"
                            onClick={handleSaveBotSettings}
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save Season Settings'}
                        </button>
                    </div>

                    <div className="info-box" style={{ marginTop: '1.5rem' }}>
                        <h4>📌 Important Notes</h4>
                        <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                            <li>Changes take effect immediately for new data collection</li>
                            <li>Existing data in the database is not modified</li>
                            <li>When a new season starts, update these settings before the first sync</li>
                            <li>The bot must be running for syncs to occur</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SettingsPanel;
