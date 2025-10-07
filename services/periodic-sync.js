/**
 * Periodic Run Sync Service
 *
 * Automatically collects M+ runs on a schedule.
 * Runs every hour by default to keep the database up to date with recent runs.
 */

const { RunCollector } = require('./run-collector');
const logger = require('../utils/logger');

// Sync interval in milliseconds (default: 1 hour)
const SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour

// Interval reference for cleanup
let syncInterval = null;

/**
 * Start periodic sync
 * @param {number} intervalMs - Sync interval in milliseconds (default: 1 hour)
 */
function startPeriodicSync(intervalMs = SYNC_INTERVAL) {
    if (syncInterval) {
        logger.warn('Periodic sync already running');
        return;
    }

    logger.info('Starting periodic run sync', {
        intervalMinutes: intervalMs / 60000
    });

    const collector = new RunCollector();

    // Run initial collection on start
    setTimeout(() => {
        runSync(collector);
    }, 5000); // Wait 5 seconds after bot starts

    // Set up periodic sync
    syncInterval = setInterval(() => {
        runSync(collector);
    }, intervalMs);

    logger.info('Periodic sync started', {
        nextSync: new Date(Date.now() + intervalMs).toISOString()
    });
}

/**
 * Stop periodic sync
 */
function stopPeriodicSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        logger.info('Periodic sync stopped');
    }
}

/**
 * Run a sync operation
 * @param {RunCollector} collector - RunCollector instance
 */
async function runSync(collector) {
    try {
        logger.info('Starting scheduled run sync');

        const startTime = Date.now();
        const summary = await collector.collectConfigCharacters();
        const duration = Date.now() - startTime;

        logger.info('Scheduled sync complete', {
            ...summary,
            duration_ms: duration,
            duration_sec: (duration / 1000).toFixed(2)
        });

        // Log stats
        const stats = collector.getStats();
        logger.info('Database stats after sync', stats);

    } catch (error) {
        logger.error('Scheduled sync failed', {
            error: error.message,
            stack: error.stack
        });
    }
}

/**
 * Manually trigger a sync (useful for testing or forced updates)
 * @returns {Promise<Object>} Sync summary
 */
async function triggerManualSync() {
    const collector = new RunCollector();
    return await collector.collectConfigCharacters();
}

module.exports = {
    startPeriodicSync,
    stopPeriodicSync,
    triggerManualSync,
    SYNC_INTERVAL
};
