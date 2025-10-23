/**
 * Configuration Service
 *
 * Centralized service for accessing bot configuration settings.
 * Provides cached access to bot_settings database table with automatic refresh.
 *
 * Features:
 * - Cached settings for performance
 * - Automatic refresh on updates
 * - Validation and fallback values
 * - Singleton pattern for global access
 */

const { getDatabase } = require('../database/mythic-runs-db');
const logger = require('../utils/logger');

/**
 * Cache duration for settings (5 minutes)
 * Settings are cached to avoid frequent database reads
 */
const CACHE_DURATION = 5 * 60 * 1000;

/**
 * ConfigService class
 * Manages bot configuration settings with caching
 */
class ConfigService {
    constructor() {
        this.cache = null;
        this.cacheTime = null;
        this.db = getDatabase();
    }

    /**
     * Load settings from database
     * @returns {Object} Settings object
     * @private
     */
    _loadSettings() {
        try {
            const stmt = this.db.db.prepare(`
                SELECT
                    current_season_id,
                    current_season_name,
                    default_region,
                    active_dungeons,
                    updated_at
                FROM bot_settings
                WHERE id = 1
            `);

            const settings = stmt.get();

            if (!settings) {
                logger.warn('No bot settings found in database, using defaults');
                return this._getDefaultSettings();
            }

            // Parse JSON dungeon list
            const parsedSettings = {
                currentSeasonId: settings.current_season_id,
                currentSeasonName: settings.current_season_name,
                defaultRegion: settings.default_region,
                activeDungeons: JSON.parse(settings.active_dungeons || '[]'),
                updatedAt: settings.updated_at
            };

            logger.debug('Loaded settings from database', {
                seasonId: parsedSettings.currentSeasonId,
                seasonName: parsedSettings.currentSeasonName,
                dungeonCount: parsedSettings.activeDungeons.length
            });

            return parsedSettings;

        } catch (error) {
            logger.error('Failed to load settings from database', {
                error: error.message,
                stack: error.stack
            });
            return this._getDefaultSettings();
        }
    }

    /**
     * Get default settings (fallback)
     * @returns {Object} Default settings
     * @private
     */
    _getDefaultSettings() {
        return {
            currentSeasonId: 15,
            currentSeasonName: 'season-tww-3',
            defaultRegion: 'us',
            activeDungeons: [
                'Ara-Kara, City of Echoes',
                'Eco-Dome Al\'dani',
                'Halls of Atonement',
                'The Dawnbreaker',
                'Priory of the Sacred Flame',
                'Operation: Floodgate',
                'Tazavesh: So\'leah\'s Gambit',
                'Tazavesh: Streets of Wonder'
            ],
            updatedAt: Date.now()
        };
    }

    /**
     * Get settings with caching
     * @returns {Object} Settings object
     * @private
     */
    _getSettings() {
        const now = Date.now();

        // Return cached settings if still valid
        if (this.cache && this.cacheTime && (now - this.cacheTime) < CACHE_DURATION) {
            return this.cache;
        }

        // Load fresh settings
        this.cache = this._loadSettings();
        this.cacheTime = now;

        return this.cache;
    }

    /**
     * Invalidate cache to force reload on next access
     */
    invalidateCache() {
        this.cache = null;
        this.cacheTime = null;
        logger.debug('Settings cache invalidated');
    }

    /**
     * Get current season ID (Blizzard API format)
     * @returns {number} Season ID
     */
    getCurrentSeasonId() {
        const settings = this._getSettings();
        return settings.currentSeasonId;
    }

    /**
     * Get current season name (RaiderIO format)
     * @returns {string} Season name (e.g., 'season-tww-3')
     */
    getCurrentSeasonName() {
        const settings = this._getSettings();
        return settings.currentSeasonName;
    }

    /**
     * Get default region
     * @returns {string} Region code (e.g., 'us', 'eu')
     */
    getDefaultRegion() {
        const settings = this._getSettings();
        return settings.defaultRegion;
    }

    /**
     * Get active dungeon pool
     * @returns {Array<string>} Array of dungeon names
     */
    getActiveDungeons() {
        const settings = this._getSettings();
        return settings.activeDungeons;
    }

    /**
     * Get all settings
     * @returns {Object} All settings
     */
    getAllSettings() {
        return this._getSettings();
    }

    /**
     * Update season information
     * @param {number} seasonId - Blizzard season ID
     * @param {string} seasonName - RaiderIO season name
     * @returns {boolean} True if successful
     */
    setSeasonInfo(seasonId, seasonName) {
        try {
            const stmt = this.db.db.prepare(`
                UPDATE bot_settings
                SET current_season_id = ?,
                    current_season_name = ?,
                    updated_at = ?
                WHERE id = 1
            `);

            stmt.run(seasonId, seasonName, Date.now());
            this.invalidateCache();

            logger.info('Season info updated', {
                seasonId,
                seasonName
            });

            return true;

        } catch (error) {
            logger.error('Failed to update season info', {
                error: error.message,
                seasonId,
                seasonName
            });
            return false;
        }
    }

    /**
     * Update default region
     * @param {string} region - Region code
     * @returns {boolean} True if successful
     */
    setDefaultRegion(region) {
        try {
            const stmt = this.db.db.prepare(`
                UPDATE bot_settings
                SET default_region = ?,
                    updated_at = ?
                WHERE id = 1
            `);

            stmt.run(region.toLowerCase(), Date.now());
            this.invalidateCache();

            logger.info('Default region updated', { region });

            return true;

        } catch (error) {
            logger.error('Failed to update default region', {
                error: error.message,
                region
            });
            return false;
        }
    }

    /**
     * Update active dungeon pool
     * @param {Array<string>} dungeons - Array of dungeon names
     * @returns {boolean} True if successful
     */
    setActiveDungeons(dungeons) {
        try {
            const stmt = this.db.db.prepare(`
                UPDATE bot_settings
                SET active_dungeons = ?,
                    updated_at = ?
                WHERE id = 1
            `);

            stmt.run(JSON.stringify(dungeons), Date.now());
            this.invalidateCache();

            logger.info('Active dungeons updated', {
                dungeonCount: dungeons.length,
                dungeons
            });

            return true;

        } catch (error) {
            logger.error('Failed to update active dungeons', {
                error: error.message
            });
            return false;
        }
    }
}

// Export singleton instance
let configServiceInstance = null;

module.exports = {
    /**
     * Get config service instance (singleton)
     * @returns {ConfigService}
     */
    getConfigService() {
        if (!configServiceInstance) {
            configServiceInstance = new ConfigService();
        }
        return configServiceInstance;
    },

    /**
     * Reset config service instance (for testing)
     */
    resetConfigService() {
        if (configServiceInstance) {
            configServiceInstance.invalidateCache();
            configServiceInstance = null;
        }
    }
};
