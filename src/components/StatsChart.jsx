import React from 'react';
import useStats from '../hooks/useStats';

function StatsChart() {
    const { stats, loading, refreshStats } = useStats();

    const formatBytes = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };

    if (loading && !stats) {
        return (
            <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading statistics...</p>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="empty-state">
                <p>No statistics available. Start the bot and sync some data to see statistics.</p>
            </div>
        );
    }

    return (
        <div className="stats-chart">
            {/* Summary Cards */}
            <div className="stats-grid">
                <div className="stat-card large">
                    <div className="stat-icon">👥</div>
                    <div className="stat-details">
                        <div className="stat-value">{stats.totalCharacters || 0}</div>
                        <div className="stat-label">Characters Tracked</div>
                    </div>
                </div>

                <div className="stat-card large">
                    <div className="stat-icon">🏃</div>
                    <div className="stat-details">
                        <div className="stat-value">{stats.totalRuns || 0}</div>
                        <div className="stat-label">Total Runs</div>
                    </div>
                </div>

                <div className="stat-card large">
                    <div className="stat-icon">💾</div>
                    <div className="stat-details">
                        <div className="stat-value">{formatBytes(stats.databaseSize)}</div>
                        <div className="stat-label">Database Size</div>
                    </div>
                </div>

                <div className="stat-card large">
                    <div className="stat-icon">📅</div>
                    <div className="stat-details">
                        <div className="stat-value">
                            {stats.lastSync ? new Date(stats.lastSync).toLocaleDateString() : 'N/A'}
                        </div>
                        <div className="stat-label">Latest Run</div>
                    </div>
                </div>
            </div>

            {/* Detailed Stats */}
            <div className="stats-details-section">
                <h3>Database Details</h3>
                <div className="stats-table">
                    <div className="stats-row">
                        <span className="stats-label">Total Characters:</span>
                        <span className="stats-value">{stats.totalCharacters || 0}</span>
                    </div>
                    <div className="stats-row">
                        <span className="stats-label">Total Runs Recorded:</span>
                        <span className="stats-value">{stats.totalRuns || 0}</span>
                    </div>
                    <div className="stats-row">
                        <span className="stats-label">Database Size:</span>
                        <span className="stats-value">{formatBytes(stats.databaseSize)}</span>
                    </div>
                    <div className="stats-row">
                        <span className="stats-label">Latest Run Date:</span>
                        <span className="stats-value">{formatDate(stats.lastSync)}</span>
                    </div>
                </div>
            </div>

            {/* Averages (if available) */}
            {stats.totalCharacters > 0 && stats.totalRuns > 0 && (
                <div className="stats-details-section">
                    <h3>Averages</h3>
                    <div className="stats-table">
                        <div className="stats-row">
                            <span className="stats-label">Runs per Character:</span>
                            <span className="stats-value">
                                {Math.round((stats.totalRuns / stats.totalCharacters) * 10) / 10}
                            </span>
                        </div>
                        <div className="stats-row">
                            <span className="stats-label">Average Data per Run:</span>
                            <span className="stats-value">
                                {formatBytes(stats.databaseSize / stats.totalRuns)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Info Box */}
            <div className="info-box">
                <strong>Note:</strong> Statistics are updated in real-time as the bot syncs new data.
                Advanced analytics and charts will be added in future updates.
            </div>

            {/* Refresh Button */}
            <div className="stats-actions">
                <button className="btn btn-secondary" onClick={refreshStats}>
                    Refresh Statistics
                </button>
            </div>
        </div>
    );
}

export default StatsChart;
