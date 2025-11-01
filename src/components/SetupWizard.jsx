import React, { useState } from 'react';
import { saveConfig, saveSettings, importDatabase, saveBlizzardCredentials } from '../tauriApi';
import { open, message } from '@tauri-apps/plugin-dialog';

function SetupWizard({ onComplete }) {
    const [step, setStep] = useState(0);
    const [config, setConfig] = useState({
        token: '',
        clientId: '',
        guildId: '',
        tokenChannel: '',
        characters: []
    });
    const [newCharacter, setNewCharacter] = useState({
        name: '',
        realm: '',
        region: 'us'
    });
    const [syncInterval, setSyncInterval] = useState(3600000); // 1 hour default
    const [importError, setImportError] = useState('');
    const [databaseImported, setDatabaseImported] = useState(false);
    const [blizzardCreds, setBlizzardCreds] = useState({
        clientId: '',
        clientSecret: ''
    });

    const steps = [
        { title: 'Welcome', icon: '👋' },
        { title: 'Discord', icon: '🤖' },
        { title: 'Characters', icon: '👥' },
        { title: 'Database', icon: '💾' },
        { title: 'Blizzard', icon: '🎮' },
        { title: 'Sync', icon: '⏰' },
        { title: 'Complete', icon: '✅' }
    ];

    const handleFileImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const importedConfig = JSON.parse(text);

            // Validate required fields
            if (!importedConfig.token || !importedConfig.characters) {
                throw new Error('Invalid config file: missing required fields');
            }

            setConfig({
                token: importedConfig.token || '',
                clientId: importedConfig.clientId || '',
                guildId: importedConfig.guildId || '',
                tokenChannel: importedConfig.tokenChannel || '',
                characters: importedConfig.characters || []
            });

            setImportError('');
            // Skip to database import step (step 3) since Discord config and characters are imported
            setStep(3);
        } catch (error) {
            setImportError('Failed to import config: ' + error.message);
        }
    };

    const handleAddCharacter = () => {
        if (!newCharacter.name || !newCharacter.realm) {
            return;
        }

        setConfig({
            ...config,
            characters: [
                ...config.characters,
                {
                    name: newCharacter.name.trim(),
                    realm: newCharacter.realm.trim().toLowerCase(),
                    region: newCharacter.region
                }
            ]
        });

        setNewCharacter({ name: '', realm: '', region: 'us' });
    };

    const handleRemoveCharacter = (index) => {
        setConfig({
            ...config,
            characters: config.characters.filter((_, i) => i !== index)
        });
    };

    const handleDatabaseImport = async () => {
        try {
            const filePath = await open({
                title: 'Select Database File',
                filters: [{
                    name: 'Database',
                    extensions: ['db']
                }],
                multiple: false,
                directory: false
            });

            console.log('[SetupWizard] File dialog result:', filePath);

            if (!filePath) {
                console.log('[SetupWizard] User cancelled file selection');
                return; // User cancelled
            }

            console.log('[SetupWizard] Importing database from:', filePath);
            const result = await importDatabase(filePath);
            console.log('[SetupWizard] Import result:', result);
            setDatabaseImported(true);
            await message(result, { title: 'DaeBot', kind: 'info' });
        } catch (error) {
            console.error('[SetupWizard] Database import error:', error);
            console.error('[SetupWizard] Error type:', typeof error);
            console.error('[SetupWizard] Error stringified:', JSON.stringify(error));
            const errorMsg = typeof error === 'string' ? error : (error?.message || String(error) || 'Unknown error');
            await message('Failed to import database: ' + errorMsg, { title: 'DaeBot', kind: 'error' });
        }
    };

    const handleComplete = async () => {
        try {
            // Save configuration
            await saveConfig(config);

            // Save Blizzard credentials if provided
            if (blizzardCreds.clientId && blizzardCreds.clientSecret) {
                await saveBlizzardCredentials(blizzardCreds);
            }

            // Save settings with sync interval
            const settings = {
                firstRun: false,
                autoStart: false,
                minimizeToTray: true,
                startMinimized: false,
                syncInterval: syncInterval
            };
            await saveSettings(settings);

            // Notify parent with new settings
            onComplete(settings);
        } catch (error) {
            await message('Failed to save configuration: ' + error.message, { title: 'DaeBot', kind: 'error' });
        }
    };

    const canProceed = () => {
        switch (step) {
            case 0: // Welcome
                return true;
            case 1: // Discord Config
                return config.token && config.clientId && config.guildId;
            case 2: // Characters
                return config.characters.length > 0;
            case 3: // Database (optional)
                return true;
            case 4: // Blizzard (optional)
                return true;
            case 5: // Sync Settings
                return true;
            case 6: // Complete
                return true;
            default:
                return false;
        }
    };

    return (
        <div className="setup-wizard">
            <div className="wizard-container">
                {/* Header */}
                <div className="wizard-header">
                    <h1>DaeBot Setup</h1>
                    <p>Let's get your bot configured</p>
                </div>

                {/* Progress Steps */}
                <div className="wizard-steps">
                    {steps.map((s, i) => (
                        <div
                            key={i}
                            className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
                        >
                            <div className="step-number">{s.icon}</div>
                            <div className="step-title">{s.title}</div>
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                <div className="wizard-content">
                    {/* Step 0: Welcome */}
                    {step === 0 && (
                        <div className="step-panel">
                            <h2>Welcome to DaeBot!</h2>
                            <p>This wizard will help you set up your Discord bot for tracking World of Warcraft Mythic+ runs.</p>

                            <div className="import-section">
                                <h3>Import Existing Configuration</h3>
                                <p>If you have an existing config.json file, you can import it here:</p>
                                <label htmlFor="config-import" className="btn btn-secondary">
                                    Import config.json
                                </label>
                                <input
                                    id="config-import"
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileImport}
                                    style={{ display: 'none' }}
                                />
                                {importError && (
                                    <div className="alert alert-error">{importError}</div>
                                )}
                            </div>

                            <div className="divider">
                                <span>OR</span>
                            </div>

                            <p>Click "Next" to set up a new configuration from scratch.</p>
                        </div>
                    )}

                    {/* Step 1: Discord Config */}
                    {step === 1 && (
                        <div className="step-panel">
                            <h2>Discord Bot Configuration</h2>
                            <p>Enter your Discord bot credentials. You can find these in the Discord Developer Portal.</p>

                            <div className="form-group">
                                <label htmlFor="token">Bot Token *</label>
                                <input
                                    id="token"
                                    type="password"
                                    className="input"
                                    placeholder="Your Discord bot token"
                                    value={config.token}
                                    onChange={(e) => setConfig({ ...config, token: e.target.value })}
                                />
                                <small>Keep this secret! Never share your bot token.</small>
                            </div>

                            <div className="form-group">
                                <label htmlFor="clientId">Client ID *</label>
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
                                <label htmlFor="guildId">Guild ID *</label>
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
                                <label htmlFor="tokenChannel">Token Channel ID (optional)</label>
                                <input
                                    id="tokenChannel"
                                    type="text"
                                    className="input"
                                    placeholder="Channel for token updates"
                                    value={config.tokenChannel}
                                    onChange={(e) => setConfig({ ...config, tokenChannel: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 2: Characters */}
                    {step === 2 && (
                        <div className="step-panel">
                            <h2>Add Characters to Track</h2>
                            <p>Add the WoW characters you want to track Mythic+ runs for.</p>

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

                            {config.characters.length > 0 && (
                                <div className="character-list">
                                    <h3>Characters ({config.characters.length})</h3>
                                    <ul>
                                        {config.characters.map((char, index) => (
                                            <li key={index} className="character-item">
                                                <span className="character-name">
                                                    {char.name} - {char.realm} ({char.region.toUpperCase()})
                                                </span>
                                                <button
                                                    className="btn btn-danger btn-small"
                                                    onClick={() => handleRemoveCharacter(index)}
                                                >
                                                    Remove
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {config.characters.length === 0 && (
                                <div className="alert alert-warning">
                                    You must add at least one character to continue.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Database Import (Optional) */}
                    {step === 3 && (
                        <div className="step-panel">
                            <h2>Import Database (Optional)</h2>
                            <p>If you have an existing mythic runs database, you can import it here. This step is optional.</p>

                            <div className="import-section">
                                <button
                                    className="btn btn-primary"
                                    onClick={handleDatabaseImport}
                                >
                                    {databaseImported ? '✅ Database Imported' : 'Import Database'}
                                </button>
                                {databaseImported && (
                                    <div className="alert alert-success" style={{ marginTop: '1rem' }}>
                                        Database imported successfully! Your existing run data will be available.
                                    </div>
                                )}
                            </div>

                            <div className="divider" style={{ margin: '2rem 0' }}>
                                <span>OR</span>
                            </div>

                            <div className="info-box">
                                <strong>Skip this step</strong> if you're starting fresh. The bot will create a new database and populate it automatically when it syncs.
                            </div>
                        </div>
                    )}

                    {/* Step 4: Blizzard API (Optional) */}
                    {step === 4 && (
                        <div className="step-panel">
                            <h2>Blizzard API Credentials (Optional)</h2>
                            <p>Blizzard API credentials provide more accurate specialization tracking for Mythic+ runs. This is optional but recommended.</p>

                            <div className="form-group">
                                <label htmlFor="blizzClientId">Blizzard Client ID</label>
                                <input
                                    id="blizzClientId"
                                    type="text"
                                    className="input"
                                    placeholder="Your Blizzard API Client ID"
                                    value={blizzardCreds.clientId}
                                    onChange={(e) => setBlizzardCreds({ ...blizzardCreds, clientId: e.target.value })}
                                />
                                <small>You can get these from <a href="https://develop.battle.net/" target="_blank" rel="noopener noreferrer">develop.battle.net</a></small>
                            </div>

                            <div className="form-group">
                                <label htmlFor="blizzClientSecret">Blizzard Client Secret</label>
                                <input
                                    id="blizzClientSecret"
                                    type="password"
                                    className="input"
                                    placeholder="Your Blizzard API Client Secret"
                                    value={blizzardCreds.clientSecret}
                                    onChange={(e) => setBlizzardCreds({ ...blizzardCreds, clientSecret: e.target.value })}
                                />
                                <small>Keep this secret! Never share your API credentials.</small>
                            </div>

                            <div className="info-box">
                                <strong>Why is this optional?</strong> The bot works without Blizzard API credentials, but with them it can determine the exact spec a player used for each run. Without them, it falls back to the player's current active spec.
                            </div>
                        </div>
                    )}

                    {/* Step 5: Sync Settings */}
                    {step === 5 && (
                        <div className="step-panel">
                            <h2>Sync Settings</h2>
                            <p>Configure how often the bot should automatically sync character data.</p>

                            <div className="form-group">
                                <label htmlFor="syncInterval">Auto-sync Interval</label>
                                <select
                                    id="syncInterval"
                                    className="input"
                                    value={syncInterval}
                                    onChange={(e) => setSyncInterval(Number(e.target.value))}
                                >
                                    <option value={900000}>Every 15 minutes</option>
                                    <option value={1800000}>Every 30 minutes</option>
                                    <option value={3600000}>Every 1 hour</option>
                                    <option value={7200000}>Every 2 hours</option>
                                    <option value={14400000}>Every 4 hours</option>
                                    <option value={28800000}>Every 8 hours</option>
                                    <option value={86400000}>Every 24 hours</option>
                                </select>
                                <small>The bot will automatically check for new runs at this interval.</small>
                            </div>

                            <div className="info-box">
                                <strong>Note:</strong> You can always trigger a manual sync or change this setting later in the Settings panel.
                            </div>
                        </div>
                    )}

                    {/* Step 6: Complete */}
                    {step === 6 && (
                        <div className="step-panel">
                            <h2>Setup Complete!</h2>
                            <p>Review your configuration before finishing:</p>

                            <div className="config-summary">
                                <div className="summary-section">
                                    <h3>Discord Bot</h3>
                                    <ul>
                                        <li>Client ID: {config.clientId}</li>
                                        <li>Guild ID: {config.guildId}</li>
                                        <li>Token: {'*'.repeat(20)}</li>
                                    </ul>
                                </div>

                                <div className="summary-section">
                                    <h3>Characters ({config.characters.length})</h3>
                                    <ul>
                                        {config.characters.map((char, i) => (
                                            <li key={i}>
                                                {char.name} - {char.realm} ({char.region.toUpperCase()})
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="summary-section">
                                    <h3>Database</h3>
                                    <ul>
                                        <li>{databaseImported ? '✅ Existing database imported' : 'New database will be created'}</li>
                                    </ul>
                                </div>

                                <div className="summary-section">
                                    <h3>Blizzard API</h3>
                                    <ul>
                                        <li>
                                            {blizzardCreds.clientId && blizzardCreds.clientSecret
                                                ? '✅ Credentials configured'
                                                : 'Not configured (spec tracking will use fallback)'}
                                        </li>
                                    </ul>
                                </div>

                                <div className="summary-section">
                                    <h3>Sync Interval</h3>
                                    <ul>
                                        <li>
                                            {syncInterval === 900000 && 'Every 15 minutes'}
                                            {syncInterval === 1800000 && 'Every 30 minutes'}
                                            {syncInterval === 3600000 && 'Every 1 hour'}
                                            {syncInterval === 7200000 && 'Every 2 hours'}
                                            {syncInterval === 14400000 && 'Every 4 hours'}
                                            {syncInterval === 28800000 && 'Every 8 hours'}
                                            {syncInterval === 86400000 && 'Every 24 hours'}
                                        </li>
                                    </ul>
                                </div>
                            </div>

                            <div className="info-box">
                                <strong>Ready to launch!</strong> Click "Complete Setup" to save your configuration and start using DaeBot.
                            </div>
                        </div>
                    )}
                </div>

                {/* Navigation Buttons */}
                <div className="wizard-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={() => setStep(step - 1)}
                        disabled={step === 0}
                    >
                        Back
                    </button>

                    {step < 6 ? (
                        <button
                            className="btn btn-primary"
                            onClick={() => setStep(step + 1)}
                            disabled={!canProceed()}
                        >
                            Next
                        </button>
                    ) : (
                        <button
                            className="btn btn-success"
                            onClick={handleComplete}
                        >
                            Complete Setup
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SetupWizard;
