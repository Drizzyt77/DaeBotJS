import React, { useState, useEffect } from 'react';
import { getSyncHistory, addSyncHistory, getLastSyncTime } from '../tauriApi';

function SyncStatus() {
    const [syncStatus, setSyncStatus] = useState({
        isRunning: false,
        currentCharacter: null,
        progress: 0,
        processedCount: 0,
        totalCount: 0,
        lastSync: null,
        error: null
    });
    const [history, setHistory] = useState([]);
    const [nextSyncInfo, setNextSyncInfo] = useState({
        timeUntilNext: null,
        percentComplete: 0,
        nextSyncTime: null
    });

    useEffect(() => {
        // Load persisted sync history on mount
        loadSyncHistory();
        loadLastSyncTime();

        // Listen for sync events (if window.api is available)
        if (window.api && window.api.onSyncStarted) {
            window.api.onSyncStarted((data) => {
                setSyncStatus({
                    isRunning: true,
                    currentCharacter: null,
                    progress: 0,
                    processedCount: 0,
                    totalCount: data.characterCount || 0,
                    lastSync: null,
                    error: null
                });
            });

            window.api.onSyncProgress((data) => {
                setSyncStatus(prev => ({
                    ...prev,
                    currentCharacter: data.characterName,
                    progress: data.percentage || 0,
                    processedCount: data.current || 0,
                    totalCount: data.total || prev.totalCount
                }));
            });

            window.api.onSyncComplete((data) => {
                const now = new Date().toISOString();
                setSyncStatus({
                    isRunning: false,
                    currentCharacter: null,
                    progress: 100,
                    processedCount: data.characterCount || 0,
                    totalCount: data.characterCount || 0,
                    lastSync: now,
                    error: null
                });

                // Save to database and update local history
                const entry = {
                    timestamp: now,
                    success: true,
                    runsAdded: data.runsAdded || 0,
                    charactersProcessed: data.characterCount || 0,
                    duration: data.duration || 0
                };

                addSyncHistory(entry).then(() => {
                    loadSyncHistory();
                    loadLastSyncTime(); // Reload to update countdown
                }).catch(err => {
                    console.error('Failed to save sync history:', err);
                });
            });

            window.api.onSyncError((data) => {
                setSyncStatus(prev => ({
                    ...prev,
                    isRunning: false,
                    error: data.error || 'Unknown error occurred'
                }));

                // Save error to database and update local history
                const entry = {
                    timestamp: new Date().toISOString(),
                    success: false,
                    error: data.error
                };

                addSyncHistory(entry).then(() => {
                    loadSyncHistory();
                }).catch(err => {
                    console.error('Failed to save sync history:', err);
                });
            });

            return () => {
                window.api.removeListener('sync-started');
                window.api.removeListener('sync-progress');
                window.api.removeListener('sync-complete');
                window.api.removeListener('sync-error');
            };
        }
    }, []);

    const loadSyncHistory = async () => {
        try {
            const historyData = await getSyncHistory(10);
            setHistory(historyData);
        } catch (error) {
            console.error('Failed to load sync history:', error);
        }
    };

    const loadLastSyncTime = async () => {
        try {
            console.log('Loading last sync time from database...');
            const lastSyncTimestamp = await getLastSyncTime();
            console.log('Last sync timestamp received:', lastSyncTimestamp);

            if (lastSyncTimestamp) {
                setSyncStatus(prev => ({
                    ...prev,
                    lastSync: lastSyncTimestamp
                }));
                console.log('Sync status updated with timestamp:', lastSyncTimestamp);
            } else {
                console.log('No sync timestamp found in database - waiting for first sync');
            }
        } catch (error) {
            console.error('Failed to load last sync time:', error);
        }
    };

    // Update countdown every second and check for new syncs
    useEffect(() => {
        const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
        const CHECK_FOR_NEW_SYNC_INTERVAL_OVERDUE = 5000; // Check every 5 seconds when overdue
        const CHECK_FOR_NEW_SYNC_INTERVAL_ACTIVE = 10000; // Check every 10 seconds during active countdown
        const CHECK_FOR_FIRST_SYNC_INTERVAL = 5000; // Check every 5 seconds when waiting for first sync

        let checkForSyncTimer = null;

        const updateCountdown = () => {
            if (!syncStatus.lastSync) {
                // No sync data yet - set up polling to check for first sync
                setNextSyncInfo({
                    timeUntilNext: null,
                    percentComplete: 0,
                    nextSyncTime: null
                });

                // Set up polling to check for first sync if not already running
                if (!checkForSyncTimer) {
                    console.log('Setting up polling for first sync (every 5 seconds)');
                    checkForSyncTimer = setInterval(() => {
                        console.log('Polling for first sync...');
                        loadLastSyncTime();
                    }, CHECK_FOR_FIRST_SYNC_INTERVAL);
                }
                return;
            }

            const lastSyncTime = new Date(syncStatus.lastSync);
            const nextSyncTime = new Date(lastSyncTime.getTime() + SYNC_INTERVAL_MS);
            const now = new Date();
            const timeUntilNext = nextSyncTime - now;

            if (timeUntilNext <= 0) {
                // Sync is overdue - check more frequently
                setNextSyncInfo({
                    timeUntilNext: 0,
                    percentComplete: 100,
                    nextSyncTime: nextSyncTime
                });

                // Start periodic check for new sync (if not already running)
                if (!checkForSyncTimer) {
                    checkForSyncTimer = setInterval(() => {
                        loadLastSyncTime();
                    }, CHECK_FOR_NEW_SYNC_INTERVAL_OVERDUE);
                }
            } else {
                const percentComplete = ((SYNC_INTERVAL_MS - timeUntilNext) / SYNC_INTERVAL_MS) * 100;
                setNextSyncInfo({
                    timeUntilNext,
                    percentComplete,
                    nextSyncTime
                });

                // During active countdown, check periodically for manual refreshes
                // but less frequently than when overdue
                if (!checkForSyncTimer) {
                    checkForSyncTimer = setInterval(() => {
                        loadLastSyncTime();
                    }, CHECK_FOR_NEW_SYNC_INTERVAL_ACTIVE);
                }
            }
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);

        return () => {
            clearInterval(interval);
            if (checkForSyncTimer) {
                clearInterval(checkForSyncTimer);
            }
        };
    }, [syncStatus.lastSync]);

    const formatDuration = (ms) => {
        if (!ms) return 'N/A';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${seconds}s`;
    };

    const formatTimestamp = (iso) => {
        if (!iso) return 'Never';
        const date = new Date(iso);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    };

    const formatTimeUntilNext = (ms) => {
        if (!ms || ms <= 0) return 'Due now';

        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    };

    return (
        <div className="card">
            <div className="card-header">
                <h2 className="card-title">🔄 Sync Status</h2>
            </div>

            <div className="card-content">
                {/* Current Sync Status */}
                <div className="sync-current">
                    <div className="sync-info">
                        <div className="info-row">
                            <span className="label">Status:</span>
                            <span className={`status-text ${syncStatus.isRunning ? 'running' : 'idle'}`}>
                                {syncStatus.isRunning ? '🔄 Syncing...' : '✅ Idle'}
                            </span>
                        </div>

                        {syncStatus.isRunning && syncStatus.currentCharacter && (
                            <div className="info-row">
                                <span className="label">Current:</span>
                                <span className="value">{syncStatus.currentCharacter}</span>
                            </div>
                        )}

                        <div className="info-row">
                            <span className="label">Last Sync: </span>
                            <span className="value">{formatTimestamp(syncStatus.lastSync)}</span>
                        </div>

                        {!syncStatus.lastSync && !syncStatus.isRunning && (
                            <div className="alert alert-info" style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#3b82f6', color: 'white', borderRadius: '4px' }}>
                                Waiting for first sync to complete. The bot will automatically sync within 5 seconds of startup, or you can trigger a manual refresh from Discord using the /characters command.
                            </div>
                        )}

                        {syncStatus.error && (
                            <div className="alert alert-error">
                                {syncStatus.error}
                            </div>
                        )}
                    </div>

                    {/* Progress Bar */}
                    {syncStatus.isRunning && (
                        <div className="progress-section">
                            <div className="progress-info">
                                <span>Progress: {syncStatus.processedCount} / {syncStatus.totalCount}</span>
                                <span>{Math.round(syncStatus.progress)}%</span>
                            </div>
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${syncStatus.progress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                    {/* Next Sync Countdown */}
                    {!syncStatus.isRunning && syncStatus.lastSync && nextSyncInfo.timeUntilNext !== null && (
                        <div className="progress-section" style={{ marginTop: '1rem' }}>
                            <div className="progress-info" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                <span>Next sync in: {formatTimeUntilNext(nextSyncInfo.timeUntilNext)}</span>
                                <span>{Math.round(nextSyncInfo.percentComplete)}%</span>
                            </div>
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{
                                        width: `${nextSyncInfo.percentComplete}%`,
                                        backgroundColor: nextSyncInfo.timeUntilNext <= 0 ? '#f59e0b' : '#3b82f6'
                                    }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sync History */}
                {history.length > 0 && (
                    <div className="sync-history">
                        <h3 className="section-title">Recent Syncs</h3>
                        <div className="history-list">
                            {history.map((entry, index) => (
                                <div key={index} className={`history-item ${entry.success ? 'success' : 'error'}`}>
                                    <div className="history-icon">
                                        {entry.success ? '✅' : '❌'}
                                    </div>
                                    <div className="history-details">
                                        <div className="history-time">
                                            {new Date(entry.timestamp).toLocaleString()}
                                        </div>
                                        {entry.success ? (
                                            <div className="history-stats">
                                                {entry.runsAdded} new runs across {entry.charactersProcessed} characters
                                                <span className="duration"> • {formatDuration(entry.duration)}</span>
                                            </div>
                                        ) : (
                                            <div className="history-error">
                                                Error: {entry.error}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {history.length === 0 && !syncStatus.lastSync && (
                    <div className="empty-state">
                        <p>No sync history yet. The bot automatically syncs character data every hour.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SyncStatus;
