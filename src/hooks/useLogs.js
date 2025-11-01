import { useState, useEffect } from 'react';
import { getLogs } from '../tauriApi';

/**
 * Custom hook for managing application logs
 */
function useLogs() {
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        loadLogs();

        // Poll for new logs every 1 second
        const interval = setInterval(loadLogs, 1000);

        return () => clearInterval(interval);
    }, []);

    const loadLogs = async () => {
        console.log('[useLogs] loadLogs called');
        try {
            const newLogs = await getLogs(500);
            console.log('[useLogs] Got logs:', newLogs);
            // Normalize log levels to lowercase for consistency with UI
            const normalizedLogs = newLogs.map(log => ({
                ...log,
                level: log.level.toLowerCase()
            }));
            setLogs(normalizedLogs);
        } catch (error) {
            console.error('Failed to load logs:', error);
        }
    };

    const clearLogs = () => {
        setLogs([]);
    };

    const addLog = (level, message) => {
        const logEntry = {
            timestamp: Date.now(),
            level: level || 'info',
            message: message
        };

        setLogs(prev => {
            const newLogs = [...prev, logEntry];
            return newLogs.slice(-1000);
        });
    };

    const filterLogs = (level) => {
        if (!level || level === 'all') {
            return logs;
        }
        return logs.filter(log => log.level === level);
    };

    return {
        logs,
        clearLogs,
        addLog,
        filterLogs
    };
}

export default useLogs;
