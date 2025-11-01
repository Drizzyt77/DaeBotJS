import { useState, useEffect } from 'react';
import { getStats } from '../tauriApi';

/**
 * Custom hook for managing database statistics
 */
function useStats() {
    const [stats, setStats] = useState({
        totalCharacters: 0,
        totalRuns: 0,
        lastSync: null,
        databaseSize: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();

        // Refresh stats periodically (every 30 seconds)
        const interval = setInterval(loadStats, 30000);

        return () => clearInterval(interval);
    }, []);

    const loadStats = async () => {
        console.log('[useStats] loadStats called');
        try {
            setLoading(true);
            const result = await getStats();
            console.log('[useStats] Got stats:', result);
            setStats(result);
        } catch (error) {
            console.error('Failed to load stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const refreshStats = async () => {
        await loadStats();
    };

    return {
        stats,
        loading,
        refreshStats
    };
}

export default useStats;
