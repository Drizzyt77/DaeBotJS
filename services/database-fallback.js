/**
 * Database Fallback Service
 *
 * Provides fallback data from the local database when Raider.IO API is unavailable.
 * Formats database data to match the expected Raider.IO response structure.
 */

const { getDatabase } = require('../database/mythic-runs-db');
const { getConfigService } = require('./config-service');
const logger = require('../utils/logger');

/**
 * Get character data from database (fallback for Raider.IO)
 * @param {string} characterName - Character name
 * @param {Object} options - Query options
 * @returns {Object|null} Character data in Raider.IO format
 */
function getCharacterFromDB(characterName, options = {}) {
    const config = getConfigService();
    const {
        realm = config.getDefaultRealm(),
        region = config.getDefaultRegion(),
        season = config.getCurrentSeasonName()
    } = options;

    // Normalize realm to lowercase to match database storage
    const normalizedRealm = realm.toLowerCase();

    try {
        const db = getDatabase();

        // Get character info
        const charStmt = db.db.prepare(`
            SELECT *
            FROM characters
            WHERE name = ? AND realm = ? AND region = ?
        `);
        const character = charStmt.get(characterName, normalizedRealm, region);

        if (!character) {
            return null;
        }

        // Get recent runs (last 500)
        const runs = db.getRunsBySpec(characterName, null, {
            realm: normalizedRealm,
            region,
            season,
            limit: 500
        });

        // Format as Raider.IO structure
        return {
            name: character.name,
            class: character.class || 'Unknown',
            active_spec_name: character.active_spec_name,
            active_spec_role: character.active_spec_role,
            realm: character.realm,
            region: character.region,
            recent_runs: runs.map(run => ({
                dungeon: run.dungeon,
                short_name: run.dungeon.split(':')[0].trim(), // Simple short name
                mythic_level: run.mythic_level,
                completed_at: new Date(run.completed_timestamp).toISOString(),
                clear_time_ms: run.duration,
                num_keystone_upgrades: run.num_keystone_upgrades,
                score: run.score,
                affixes: run.affixes || [],
                url: null // Database doesn't have URLs
            })),
            data_source: 'database'
        };

    } catch (error) {
        logger.error('Failed to get character from database', {
            characterName,
            error: error.message
        });
        return null;
    }
}

/**
 * Get recent runs data for multiple characters (fallback for Raider.IO)
 * @param {Array<string|Object>} characters - Array of character names or character objects with {name, realm, region}
 * @param {Object} options - Query options
 * @returns {Array} Array of character data with recent runs
 */
function getRecentRunsFromDB(characters, options = {}) {
    const config = getConfigService();
    const defaultSeason = options.season || config.getCurrentSeasonName();

    logger.info('Using database fallback for recent runs', {
        characterCount: characters.length,
        season: defaultSeason
    });

    const results = [];

    for (const char of characters) {
        // Handle both string (legacy) and object (new) format
        const name = typeof char === 'string' ? char : char.name;
        const realm = typeof char === 'object' && char.realm ? char.realm : config.getDefaultRealm();
        const region = typeof char === 'object' && char.region ? char.region : config.getDefaultRegion();

        // Normalize realm to lowercase to match database storage
        const normalizedRealm = realm.toLowerCase();

        const characterData = getCharacterFromDB(name, { realm: normalizedRealm, region, season: defaultSeason });
        if (characterData) {
            results.push({
                name: characterData.name,
                class: characterData.class,
                role: characterData.active_spec_role,
                recent_runs: characterData.recent_runs
            });
        }
    }

    logger.info('Database fallback complete', {
        requested: characters.length,
        found: results.length
    });

    return results;
}

/**
 * Get mythic plus best runs for multiple characters (fallback for Raider.IO)
 * @param {Array<string|Object>} characters - Array of character names or character objects with {name, realm, region}
 * @param {Object} options - Query options
 * @returns {Array} Array of character data with best runs
 */
function getMythicPlusDataFromDB(characters, options = {}) {
    const config = getConfigService();
    const defaultSeason = options.season || config.getCurrentSeasonName();

    logger.info('Using database fallback for mythic+ data', {
        characterCount: characters.length,
        season: defaultSeason
    });

    const results = [];

    for (const char of characters) {
        try {
            // Handle both string (legacy) and object (new) format
            const name = typeof char === 'string' ? char : char.name;
            const realm = typeof char === 'object' && char.realm ? char.realm : config.getDefaultRealm();
            const region = typeof char === 'object' && char.region ? char.region : config.getDefaultRegion();

            // Normalize realm to lowercase to match database storage
            const normalizedRealm = realm.toLowerCase();

            const db = getDatabase();

            // Get character info
            const charStmt = db.db.prepare(`
                SELECT *
                FROM characters
                WHERE name = ? AND realm = ? AND region = ?
            `);
            const character = charStmt.get(name, normalizedRealm, region);

            if (!character) {
                logger.debug('Character not found in database', { name, realm, region });
                continue;
            }

            // Get best runs per dungeon
            const bestRuns = db.getBestRunsPerDungeon(name, null, {
                realm: normalizedRealm,
                region,
                season: defaultSeason
            });

            // Calculate M+ score (simplified - sum of all dungeon scores)
            const mythic_plus_score = bestRuns.reduce((sum, run) => sum + (run.score || 0), 0);

            results.push({
                name: character.name,
                class: character.class || 'Unknown',
                role: character.active_spec_role,
                mythic_plus_score,
                mythic_plus_runs: bestRuns.map(run => ({
                    dungeon: run.dungeon,
                    mythic_level: run.mythic_level,
                    score: run.score,
                    timed: run.num_keystone_upgrades
                }))
            });

        } catch (error) {
            logger.error('Failed to get M+ data from database for character', {
                character: char,
                error: error.message
            });
        }
    }

    logger.info('Database fallback complete', {
        requested: characters.length,
        found: results.length
    });

    return results;
}

/**
 * Check if character exists in database
 * @param {string} characterName - Character name
 * @param {Object} options - Query options
 * @returns {boolean} True if character exists
 */
function characterExistsInDB(characterName, options = {}) {
    const config = getConfigService();
    const {
        realm = config.getDefaultRealm(),
        region = config.getDefaultRegion()
    } = options;

    try {
        const db = getDatabase();
        const charId = db.getCharacterId(characterName, realm, region);
        return charId !== null;
    } catch (error) {
        logger.error('Failed to check if character exists', {
            characterName,
            error: error.message
        });
        return false;
    }
}

module.exports = {
    getCharacterFromDB,
    getRecentRunsFromDB,
    getMythicPlusDataFromDB,
    characterExistsInDB
};
