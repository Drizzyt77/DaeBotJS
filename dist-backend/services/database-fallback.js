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

    try {
        const db = getDatabase();

        // Get character info
        const charStmt = db.db.prepare(`
            SELECT *
            FROM characters
            WHERE name = ? AND realm = ? AND region = ?
        `);
        const character = charStmt.get(characterName, realm, region);

        if (!character) {
            return null;
        }

        // Get recent runs (last 500)
        const runs = db.getRunsBySpec(characterName, null, {
            realm,
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
 * @param {Array<string>} characterNames - Array of character names
 * @param {Object} options - Query options
 * @returns {Array} Array of character data with recent runs
 */
function getRecentRunsFromDB(characterNames, options = {}) {
    const config = getConfigService();
    const {
        realm = config.getDefaultRealm(),
        region = config.getDefaultRegion(),
        season = config.getCurrentSeasonName()
    } = options;

    logger.info('Using database fallback for recent runs', {
        characterCount: characterNames.length,
        realm,
        region,
        season
    });

    const results = [];

    for (const name of characterNames) {
        const characterData = getCharacterFromDB(name, { realm, region, season });
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
        requested: characterNames.length,
        found: results.length
    });

    return results;
}

/**
 * Get mythic plus best runs for multiple characters (fallback for Raider.IO)
 * @param {Array<string>} characterNames - Array of character names
 * @param {Object} options - Query options
 * @returns {Array} Array of character data with best runs
 */
function getMythicPlusDataFromDB(characterNames, options = {}) {
    const config = getConfigService();
    const {
        realm = config.getDefaultRealm(),
        region = config.getDefaultRegion(),
        season = config.getCurrentSeasonName()
    } = options;

    logger.info('Using database fallback for mythic+ data', {
        characterCount: characterNames.length,
        realm,
        region,
        season
    });

    const results = [];

    for (const name of characterNames) {
        try {
            const db = getDatabase();

            // Get character info
            const charStmt = db.db.prepare(`
                SELECT *
                FROM characters
                WHERE name = ? AND realm = ? AND region = ?
            `);
            const character = charStmt.get(name, realm, region);

            if (!character) {
                continue;
            }

            // Get best runs per dungeon
            const bestRuns = db.getBestRunsPerDungeon(name, null, {
                realm,
                region,
                season
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
                characterName: name,
                error: error.message
            });
        }
    }

    logger.info('Database fallback complete', {
        requested: characterNames.length,
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
