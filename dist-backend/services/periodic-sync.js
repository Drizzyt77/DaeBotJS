/**
 * Periodic Run Sync Service
 *
 * Automatically collects M+ runs on a schedule.
 * Runs every hour by default to keep the database up to date with recent runs.
 * Also populates the character command cache to prevent re-fetching after sync.
 */

const { RunCollector } = require('./run-collector');
const logger = require('../utils/logger');
const { getCharacterCacheManager } = require('../utils/cache-manager');
const { getDatabase } = require('../database/mythic-runs-db');

// Sync interval in milliseconds (default: 1 hour)
const SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour

// Interval reference for cleanup
let syncInterval = null;

// Get singleton cache manager for populating cache after sync
const cacheManager = getCharacterCacheManager();

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
    const statusTracker = global.statusTracker;

    try {
        logger.info('Starting scheduled run sync');

        // Get character count for progress tracking
        const { getCharacters } = require('../helpers/get-data');
        const characters = getCharacters();
        const characterCount = characters.length;

        // Notify status tracker
        if (statusTracker) {
            statusTracker.startSync(characterCount);
        }

        const startTime = Date.now();
        const summary = await collector.collectConfigCharacters();
        const duration = Date.now() - startTime;

        logger.info('Scheduled sync complete', {
            ...summary,
            duration_ms: duration,
            duration_sec: (duration / 1000).toFixed(2)
        });

        // Record sync in database
        try {
            const db = getDatabase();
            db.insertSyncHistory({
                timestamp: Date.now(),
                sync_type: 'auto',
                runs_added: summary.total_runs_added || 0,
                characters_processed: summary.total_characters || 0,
                duration_ms: duration,
                success: true
            });
            logger.info('Sync history recorded in database');
        } catch (dbError) {
            logger.error('Failed to record sync history', {
                error: dbError.message
            });
        }

        // Notify completion
        if (statusTracker) {
            statusTracker.completeSync({
                runsAdded: summary.total_runs_added || 0,
                characterCount: summary.total_characters || 0,
                duration: duration
            });
        }

        // Log stats
        const stats = collector.getStats();
        logger.info('Database stats after sync', stats);

        // Populate cache with fresh data after successful sync
        // This prevents the character command from re-fetching data
        try {
            const data = require('../helpers/get-data');
            const characterData = await data.get_data();

            // Populate all relevant caches
            cacheManager.setCharacterData(characterData, false);

            // Also fetch and cache raid data
            const raidData = await data.get_raid_data();
            cacheManager.setRaidData(raidData);

            logger.info('Cache populated after sync', {
                characterCount: characterData.length,
                cacheValid: true
            });
        } catch (cacheError) {
            logger.warn('Failed to populate cache after sync', {
                error: cacheError.message
            });
            // Don't fail the sync if cache population fails
        }

    } catch (error) {
        logger.error('Scheduled sync failed', {
            error: error.message,
            stack: error.stack
        });

        // Record failed sync in database
        try {
            const db = getDatabase();
            db.insertSyncHistory({
                timestamp: Date.now(),
                sync_type: 'auto',
                runs_added: 0,
                characters_processed: 0,
                success: false,
                error_message: error.message
            });
        } catch (dbError) {
            logger.error('Failed to record sync error', {
                error: dbError.message
            });
        }

        // Notify error
        if (statusTracker) {
            statusTracker.errorSync(error.message);
        }
    }
}

/**
 * Manually trigger a sync (useful for testing or forced updates)
 * @returns {Promise<Object>} Sync summary
 */
async function triggerManualSync() {
    const collector = new RunCollector();
    const startTime = Date.now();

    try {
        const summary = await collector.collectConfigCharacters();
        const duration = Date.now() - startTime;

        // Record manual sync in database
        try {
            const db = getDatabase();
            db.insertSyncHistory({
                timestamp: Date.now(),
                sync_type: 'manual',
                runs_added: summary.total_runs_added || 0,
                characters_processed: summary.total_characters || 0,
                duration_ms: duration,
                success: true
            });
            logger.info('Manual sync history recorded in database');
        } catch (dbError) {
            logger.error('Failed to record manual sync history', {
                error: dbError.message
            });
        }

        return summary;
    } catch (error) {
        // Record failed manual sync
        try {
            const db = getDatabase();
            db.insertSyncHistory({
                timestamp: Date.now(),
                sync_type: 'manual',
                runs_added: 0,
                characters_processed: 0,
                duration_ms: Date.now() - startTime,
                success: false,
                error_message: error.message
            });
        } catch (dbError) {
            logger.error('Failed to record manual sync error', {
                error: dbError.message
            });
        }

        throw error;
    }
}

module.exports = {
    startPeriodicSync,
    stopPeriodicSync,
    triggerManualSync,
    SYNC_INTERVAL
};
