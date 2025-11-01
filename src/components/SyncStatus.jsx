import React, { useState, useEffect } from 'react';
import { getSyncHistory, addSyncHistory } from '../tauriApi';

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

    useEffect(() => {
        // Load persisted sync history on mount
        loadSyncHistory();

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
                setSyncStatus({
                    isRunning: false,
                    currentCharacter: null,
                    progress: 100,
                    processedCount: data.characterCount || 0,
                    totalCount: data.characterCount || 0,
                    lastSync: new Date().toISOString(),
                    error: null
                });

                // Save to database and update local history
                const entry = {
                    timestamp: new Date().toISOString(),
                    success: true,
                    runsAdded: data.runsAdded || 0,
                    charactersProcessed: data.characterCount || 0,
                    duration: data.duration || 0
                };

                addSyncHistory(entry).then(() => {
                    loadSyncHistory();
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
                            <span className="label">Last Sync:</span>
                            <span className="value">{formatTimestamp(syncStatus.lastSync)}</span>
                        </div>

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
