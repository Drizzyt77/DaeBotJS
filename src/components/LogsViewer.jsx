import { useState, useEffect, useRef } from 'react';
import useLogs from '../hooks/useLogs';
import { ask } from '@tauri-apps/plugin-dialog';

function LogsViewer() {
    const { logs, clearLogs } = useLogs();
    const [filter, setFilter] = useState('all');
    const [autoScroll, setAutoScroll] = useState(true);
    const [search, setSearch] = useState('');
    const logsEndRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        if (autoScroll && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll]);

    const handleScroll = () => {
        if (containerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

            if (!isAtBottom && autoScroll) {
                setAutoScroll(false);
            } else if (isAtBottom && !autoScroll) {
                setAutoScroll(true);
            }
        }
    };

    const handleClearLogs = async () => {
        const confirmed = await ask('Are you sure you want to clear all logs?', { title: 'DaeBot', kind: 'warning' });
        if (confirmed) {
            clearLogs();
        }
    };

    const exportLogs = () => {
        const logText = filteredLogs.map(log => {
            let line = `[${new Date(log.timestamp).toISOString()}] [${log.level.toUpperCase()}] ${log.message}`;
            if (log.metadata) {
                const metadataStr = Object.entries(log.metadata)
                    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
                    .join(', ');
                line += ` | ${metadataStr}`;
            }
            return line;
        }).join('\n');

        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `daebot-logs-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getLogIcon = (level) => {
        switch (level) {
            case 'error':
                return '❌';
            case 'warn':
                return '⚠️';
            case 'success':
                return '✅';
            case 'info':
            default:
                return 'ℹ️';
        }
    };

    const filteredLogs = logs.filter(log => {
        // Filter by level
        if (filter !== 'all' && log.level !== filter) {
            return false;
        }

        // Filter by search
        if (search && !log.message.toLowerCase().includes(search.toLowerCase())) {
            return false;
        }

        return true;
    });

    const logCounts = {
        all: logs.length,
        info: logs.filter(l => l.level === 'info').length,
        warn: logs.filter(l => l.level === 'warn').length,
        error: logs.filter(l => l.level === 'error').length,
        success: logs.filter(l => l.level === 'success').length
    };

    return (
        <div className="logs-viewer">
            {/* Controls */}
            <div className="logs-controls">
                <div className="logs-filters">
                    <button
                        className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All ({logCounts.all})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'info' ? 'active' : ''}`}
                        onClick={() => setFilter('info')}
                    >
                        Info ({logCounts.info})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'warn' ? 'active' : ''}`}
                        onClick={() => setFilter('warn')}
                    >
                        Warnings ({logCounts.warn})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'error' ? 'active' : ''}`}
                        onClick={() => setFilter('error')}
                    >
                        Errors ({logCounts.error})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'success' ? 'active' : ''}`}
                        onClick={() => setFilter('success')}
                    >
                        Success ({logCounts.success})
                    </button>
                </div>

                <div className="logs-search">
                    <input
                        type="text"
                        className="input input-small"
                        placeholder="Search logs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="logs-actions">
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={autoScroll}
                            onChange={(e) => setAutoScroll(e.target.checked)}
                        />
                        Auto-scroll
                    </label>

                    <button
                        className="btn btn-secondary btn-small"
                        onClick={exportLogs}
                        disabled={filteredLogs.length === 0}
                    >
                        Export
                    </button>

                    <button
                        className="btn btn-danger btn-small"
                        onClick={handleClearLogs}
                        disabled={logs.length === 0}
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Logs Display */}
            <div
                className="logs-container"
                ref={containerRef}
                onScroll={handleScroll}
            >
                {filteredLogs.length === 0 ? (
                    <div className="empty-state">
                        {logs.length === 0 ? (
                            <p>No logs yet. Start the bot to see activity logs.</p>
                        ) : (
                            <p>No logs match your current filters.</p>
                        )}
                    </div>
                ) : (
                    <div className="logs-list">
                        {filteredLogs.map((log, index) => (
                            <div key={index} className={`log-entry log-${log.level}`}>
                                <span className="log-icon">{getLogIcon(log.level)}</span>
                                <span className="log-timestamp">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                                <span className="log-level">{log.level.toUpperCase()}</span>
                                <span className="log-message">
                                    {log.message}
                                    {log.metadata && (
                                        <span className="log-metadata">
                                            {' | '}
                                            {Object.entries(log.metadata).map(([key, value], i) => (
                                                <span key={key}>
                                                    {i > 0 && ', '}
                                                    <span className="metadata-key">{key}</span>
                                                    {': '}
                                                    <span className="metadata-value">
                                                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                    </span>
                                                </span>
                                            ))}
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                )}
            </div>
        </div>
    );
}

export default LogsViewer;
