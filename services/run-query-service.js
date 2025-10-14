/**
 * Run Query Service
 *
 * Bridges the database and UI by providing formatted run data for Discord displays.
 * Converts database runs to the format expected by character image generator and embeds.
 */

const { getDatabase } = require('../database/mythic-runs-db');
const logger = require('../utils/logger');

// Current season (should match run-collector.js)
const CURRENT_SEASON = 'season-tww-3';

/**
 * Get available specs for a character based on stored runs
 * @param {string} characterName - Character name
 * @param {Object} options - Query options
 * @returns {Array<string>} Array of spec names
 */
function getAvailableSpecs(characterName, options = {}) {
    const {
        realm = 'thrall',
        region = 'us',
        season = CURRENT_SEASON
    } = options;

    try {
        const db = getDatabase();

        const query = `
            SELECT DISTINCT r.spec_name
            FROM mythic_runs r
            INNER JOIN characters c ON r.character_id = c.id
            WHERE c.name = ? AND c.realm = ? AND c.region = ?
            ${season ? 'AND r.season = ?' : ''}
            AND r.spec_name IS NOT NULL
            ORDER BY r.spec_name
        `;

        const params = [characterName, realm, region];
        if (season) params.push(season);

        const stmt = db.db.prepare(query);
        const results = stmt.all(...params);

        return results.map(row => row.spec_name);

    } catch (error) {
        logger.error('Failed to get available specs', {
            characterName,
            error: error.message
        });
        return [];
    }
}

/**
 * Get best runs per dungeon for a character (optionally filtered by spec)
 * Formatted for character image generator
 * @param {string} characterName - Character name
 * @param {string} specName - Spec name (null for all specs)
 * @param {Object} options - Query options
 * @returns {Array} Formatted runs for UI
 */
function getBestRunsForUI(characterName, specName = null, options = {}) {
    const {
        realm = 'thrall',
        region = 'us',
        season = CURRENT_SEASON
    } = options;

    try {
        const db = getDatabase();
        const runs = db.getBestRunsPerDungeon(characterName, specName, {
            realm,
            region,
            season
        });

        // Convert to format expected by character image generator
        return runs.map(run => ({
            dungeon: run.dungeon,
            mythic_level: run.mythic_level,
            score: run.score,
            timed: run.num_keystone_upgrades || 0,
            completed_at: new Date(run.completed_timestamp).toISOString(),
            num_keystone_upgrades: run.num_keystone_upgrades,
            spec_name: run.spec_name,
            spec_role: run.spec_role
        }));

    } catch (error) {
        logger.error('Failed to get best runs for UI', {
            characterName,
            specName,
            error: error.message
        });
        return [];
    }
}

/**
 * Get enhanced character data with database runs
 * Merges Raider.IO data with database runs
 * @param {Object} characterData - Character data from Raider.IO
 * @param {string} selectedSpec - Selected spec filter (null for 'Overall')
 * @param {Object} options - Query options
 * @returns {Object} Enhanced character data
 */
function enhanceCharacterWithDBRuns(characterData, selectedSpec = null, options = {}) {
    const {
        realm = 'thrall',
        region = 'us',
        season = CURRENT_SEASON
    } = options;

    try {
        const characterName = characterData.name;

        // Get available specs from database
        const availableSpecs = getAvailableSpecs(characterName, { realm, region, season });

        // Get runs (filtered by spec if specified)
        const specFilter = (selectedSpec && selectedSpec !== 'Overall') ? selectedSpec : null;
        const dbRuns = getBestRunsForUI(characterName, specFilter, { realm, region, season });

        logger.debug('Enhanced character with DB runs', {
            characterName,
            selectedSpec,
            availableSpecs,
            dbRunsCount: dbRuns.length,
            dbRunsSample: dbRuns.slice(0, 3).map(r => ({
                dungeon: r.dungeon,
                level: r.mythic_level,
                spec: r.spec_name,
                score: r.score
            }))
        });

        // Return enhanced character data
        return {
            ...characterData,
            mythic_plus_runs: dbRuns,
            available_specs: availableSpecs,
            selected_spec: selectedSpec || 'Overall',
            data_source: 'database'
        };

    } catch (error) {
        logger.error('Failed to enhance character with DB runs', {
            characterName: characterData.name,
            error: error.message
        });

        // Return original data if enhancement fails
        return {
            ...characterData,
            available_specs: [],
            selected_spec: 'Overall',
            data_source: 'raiderio'
        };
    }
}

/**
 * Calculate Resilient keystone level for a character
 * Finds the highest level where ALL dungeons in the season are timed
 * @param {string} characterName - Character name
 * @param {Object} options - Query options
 * @returns {number} Resilient level (0 if no resilient level found)
 */
function calculateResilientLevel(characterName, options = {}) {
    const {
        realm = 'thrall',
        region = 'us',
        season = CURRENT_SEASON
    } = options;

    try {
        const db = getDatabase();

        // Query to get the highest mythic level for each dungeon where the key was timed
        const query = `
            SELECT
                r.dungeon,
                MAX(CASE WHEN r.num_keystone_upgrades > 0 THEN r.mythic_level ELSE 0 END) as highest_timed_level
            FROM mythic_runs r
            INNER JOIN characters c ON r.character_id = c.id
            WHERE c.name = ? AND c.realm = ? AND c.region = ?
            ${season ? 'AND r.season = ?' : ''}
            GROUP BY r.dungeon
        `;

        const params = [characterName, realm, region];
        if (season) params.push(season);

        const stmt = db.db.prepare(query);
        const results = stmt.all(...params);

        // If no runs found, return 0
        if (results.length === 0) {
            return 0;
        }

        // Get total unique dungeons in the season
        const totalDungeons = results.length;

        // Find the highest level where ALL dungeons have a timed run
        // Start from the minimum highest_timed_level and work down
        const timedLevels = results
            .map(r => r.highest_timed_level)
            .filter(level => level > 0);

        if (timedLevels.length !== totalDungeons) {
            // Not all dungeons have been timed, so no resilient level
            return 0;
        }

        // The resilient level is the MINIMUM of all highest timed levels
        // This represents the highest level where ALL dungeons are timed
        const resilientLevel = Math.min(...timedLevels);

        logger.debug('Calculated Resilient level', {
            characterName,
            totalDungeons,
            timedDungeons: timedLevels.length,
            resilientLevel,
            dungeonLevels: results.map(r => ({ dungeon: r.dungeon, level: r.highest_timed_level }))
        });

        return resilientLevel;

    } catch (error) {
        logger.error('Failed to calculate resilient level', {
            characterName,
            error: error.message
        });
        return 0;
    }
}

/**
 * Get run count by spec for a character
 * Useful for showing stats in the UI
 * @param {string} characterName - Character name
 * @param {Object} options - Query options
 * @returns {Object} Spec names mapped to run counts
 */
function getRunCountsBySpec(characterName, options = {}) {
    const {
        realm = 'thrall',
        region = 'us',
        season = CURRENT_SEASON
    } = options;

    try {
        const db = getDatabase();

        const query = `
            SELECT r.spec_name, COUNT(*) as count
            FROM mythic_runs r
            INNER JOIN characters c ON r.character_id = c.id
            WHERE c.name = ? AND c.realm = ? AND c.region = ?
            ${season ? 'AND r.season = ?' : ''}
            AND r.spec_name IS NOT NULL
            GROUP BY r.spec_name
        `;

        const params = [characterName, realm, region];
        if (season) params.push(season);

        const stmt = db.db.prepare(query);
        const results = stmt.all(...params);

        const counts = {};
        results.forEach(row => {
            counts[row.spec_name] = row.count;
        });

        return counts;

    } catch (error) {
        logger.error('Failed to get run counts by spec', {
            characterName,
            error: error.message
        });
        return {};
    }
}

module.exports = {
    getAvailableSpecs,
    getBestRunsForUI,
    enhanceCharacterWithDBRuns,
    getRunCountsBySpec,
    calculateResilientLevel,
    CURRENT_SEASON
};
