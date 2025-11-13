import React, { useState, useEffect } from 'react';
import SyncStatus from './SyncStatus';
import CharacterList from './CharacterList';
import LogsViewer from './LogsViewer';
import SettingsPanel from './SettingsPanel';
import StatsChart from './StatsChart';
import UpdateNotification from './UpdateNotification';
import useBot from '../hooks/useBot';
import useStats from '../hooks/useStats';
import { quitApp, getAppVersion, getAvailableSeasons } from '../tauriApi';
import { message, ask } from '@tauri-apps/plugin-dialog';

function Dashboard({ settings }) {
    const [activeTab, setActiveTab] = useState('overview');
    const [appVersion, setAppVersion] = useState('');
    const [selectedSeason, setSelectedSeason] = useState(null);
    const [availableSeasons, setAvailableSeasons] = useState([]);
    const { botStatus, startBot, stopBot, restartBot } = useBot();
    const { stats, refreshStats } = useStats(selectedSeason);

    useEffect(() => {
        loadVersion();
        loadSeasons();
    }, []);

    const loadVersion = async () => {
        try {
            const version = await getAppVersion();
            setAppVersion(version);
        } catch (error) {
            console.error('Failed to load version:', error);
        }
    };

    const loadSeasons = async () => {
        try {
            const seasons = await getAvailableSeasons();
            setAvailableSeasons(seasons);
        } catch (error) {
            console.error('Failed to load seasons:', error);
        }
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'characters', label: 'Characters', icon: '👥' },
        { id: 'logs', label: 'Logs', icon: '📝' },
        { id: 'stats', label: 'Statistics', icon: '📈' },
        { id: 'settings', label: 'Settings', icon: '⚙️' }
    ];

    const handleStartBot = async () => {
        try {
            await startBot();
        } catch (error) {
            console.error('Failed to start bot:', error);
            await message('Failed to start bot: ' + error, { title: 'DaeBot', kind: 'error' });
        }
    };

    const handleStopBot = async () => {
        try {
            await stopBot();
        } catch (error) {
            console.error('Failed to stop bot:', error);
            await message('Failed to stop bot: ' + error, { title: 'DaeBot', kind: 'error' });
        }
    };

    const handleRestartBot = async () => {
        try {
            await restartBot();
        } catch (error) {
            console.error('Failed to restart bot:', error);
            await message('Failed to restart bot: ' + error, { title: 'DaeBot', kind: 'error' });
        }
    };

    const handleQuit = async () => {
        const confirmed = await ask('Are you sure you want to quit DaeBot?\n\nNote: Click the X button to minimize to system tray instead.', { title: 'DaeBot', kind: 'warning' });
        if (confirmed) {
            try {
                await quitApp();
            } catch (error) {
                console.error('Failed to quit app:', error);
            }
        }
    };

    return (
        <div className="app-container">
            {/* Update Notification */}
            <UpdateNotification />
            {/* Header */}
            <header className="app-header">
                <div>
                    <h1 className="app-title">DaeBot {appVersion && <span className="version-badge">v{appVersion}</span>}</h1>
                    <p className="app-subtitle">WoW Character Manager</p>
                </div>

                <div className="header-actions">
                    <div className={`status-badge ${
                        botStatus.status === 'running' ? 'online' :
                        botStatus.status === 'stopping' ? 'stopping' :
                        'offline'
                    }`}>
                        <span className="status-dot"></span>
                        {botStatus.status === 'running' ? 'Online' :
                         botStatus.status === 'stopping' ? 'Stopping...' :
                         'Offline'}
                    </div>

                    {botStatus.online ? (
                        <button
                            className="btn btn-danger btn-small"
                            onClick={handleStopBot}
                            disabled={botStatus.status === 'stopping'}
                        >
                            Stop Bot
                        </button>
                    ) : (
                        <button
                            className="btn btn-success btn-small"
                            onClick={handleStartBot}
                            disabled={botStatus.status === 'stopping'}
                        >
                            Start Bot
                        </button>
                    )}

                    <button
                        className="btn btn-secondary btn-small"
                        onClick={handleRestartBot}
                        disabled={botStatus.status === 'stopping'}
                    >
                        Restart
                    </button>

                    <button className="btn btn-danger btn-small" onClick={handleQuit}>
                        Quit
                    </button>
                </div>
            </header>

            {/* Tabs */}
            <div className="tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <span>{tab.icon}</span> {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="tab-content">
                {activeTab === 'overview' && (
                    <div className="grid grid-2">
                        <SyncStatus />

                        <div className="card">
                            <div className="card-header">
                                <h2 className="card-title">📊 Quick Stats</h2>
                                {availableSeasons.length > 0 && (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <label htmlFor="seasonFilter" style={{ fontSize: '0.9rem', marginRight: '0.5rem' }}>Season:</label>
                                        <select
                                            id="seasonFilter"
                                            className="input"
                                            value={selectedSeason || ''}
                                            onChange={(e) => setSelectedSeason(e.target.value || null)}
                                            style={{
                                                padding: '0.25rem 0.5rem',
                                                fontSize: '0.9rem',
                                                width: 'auto'
                                            }}
                                        >
                                            <option value="">All Seasons</option>
                                            {availableSeasons.map(season => (
                                                <option key={season} value={season}>{season}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className="stat-grid">
                                <div className="stat-card">
                                    <div className="stat-label">Characters</div>
                                    <div className="stat-value">{stats?.totalCharacters || 0}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Total Runs</div>
                                    <div className="stat-value">{stats?.totalRuns || 0}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">DB Size</div>
                                    <div className="stat-value">
                                        {stats?.databaseSize ? (stats.databaseSize / 1024 / 1024).toFixed(2) + ' MB' : '0 MB'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ gridColumn: '1 / -1' }}>
                            <div className="card-header">
                                <h2 className="card-title">👥 Recent Activity</h2>
                            </div>
                            <CharacterList compact={true} />
                        </div>
                    </div>
                )}

                {activeTab === 'characters' && (
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">👥 Character Sync Status</h2>
                            <p className="card-subtitle">Monitor sync status for all configured characters</p>
                        </div>
                        <CharacterList compact={false} />
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">📝 Application Logs</h2>
                            <p className="card-subtitle">Real-time bot activity and error logs</p>
                        </div>
                        <LogsViewer />
                    </div>
                )}

                {activeTab === 'stats' && (
                    <div>
                        <div className="card mb-lg">
                            <div className="card-header">
                                <h2 className="card-title">📈 Database Statistics</h2>
                                <p className="card-subtitle">Visual insights into your M+ data</p>
                                {availableSeasons.length > 0 && (
                                    <div style={{ marginTop: '0.75rem' }}>
                                        <label htmlFor="statsSeasonFilter" style={{ fontSize: '0.9rem', marginRight: '0.5rem', fontWeight: 'bold' }}>Filter by Season:</label>
                                        <select
                                            id="statsSeasonFilter"
                                            className="input"
                                            value={selectedSeason || ''}
                                            onChange={(e) => setSelectedSeason(e.target.value || null)}
                                            style={{
                                                padding: '0.4rem 0.75rem',
                                                fontSize: '0.95rem',
                                                width: 'auto'
                                            }}
                                        >
                                            <option value="">All Seasons (Overall)</option>
                                            {availableSeasons.map(season => (
                                                <option key={season} value={season}>{season}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <StatsChart season={selectedSeason} />
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">⚙️ Settings</h2>
                            <p className="card-subtitle">Configure DaeBot behavior and preferences</p>
                        </div>
                        <SettingsPanel settings={settings} />
                    </div>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
