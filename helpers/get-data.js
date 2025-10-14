/**
 * Character Data Service
 * Provides high-level API for fetching various types of WoW character data
 * Uses the RaiderIO client service for all API interactions with improved error handling
 * Falls back to local database when RaiderIO is unavailable
 */

const { RaiderIOClient } = require('../services/raiderio-client');
const { getRecentRunsFromDB, getMythicPlusDataFromDB } = require('../services/database-fallback');
const logger = require('../utils/logger');

// Initialize the RaiderIO API client
const raiderIOClient = new RaiderIOClient();

/**
 * Gets the list of character names from configuration
 * @returns {Array<string>} Array of character names
 * @throws {Error} If config.json is missing or malformed
 */
function getCharacterNames() {
    try {
        const { characters } = require('../config.json');

        if (!Array.isArray(characters)) {
            throw new Error('Characters configuration must be an array');
        }

        if (characters.length === 0) {
            logger.warn('No characters configured in config.json');
        }

        return characters;
    } catch (error) {
        logger.error('Failed to load character configuration', { error: error.message });
        throw new Error('Unable to load character configuration');
    }
}

module.exports = {
    /**
     * Fetches mythic plus best runs data for all configured characters
     * Uses the character names from config.json to request data from RaiderIO API
     * Falls back to database if RaiderIO is unavailable
     *
     * @returns {Promise<Array>} Array of character objects with mythic plus run data
     * @throws {Error} If character configuration cannot be loaded
     *
     * @example
     * const characters = await get_data();
     * characters.forEach(char => {
     *   console.log(`${char.name}: ${char.mythic_plus_runs.length} runs`);
     * });
     */
    get_data: async function () {
        const characterNames = getCharacterNames();

        if (characterNames.length === 0) {
            logger.warn('No characters to fetch mythic plus data for');
            return [];
        }

        logger.info('Fetching mythic plus data', { characterCount: characterNames.length });

        try {
            const data = await raiderIOClient.getMythicPlusData(characterNames);

            // If RaiderIO returns incomplete results, fill in missing characters from database
            if (data.length < characterNames.length) {
                logger.warn('RaiderIO returned incomplete data, attempting database fallback for missing characters', {
                    requestedCharacters: characterNames.length,
                    receivedCharacters: data.length,
                    missingCount: characterNames.length - data.length
                });

                try {
                    // Find which characters are missing from RaiderIO response
                    const receivedNames = data.map(char => char.name.toLowerCase());
                    const missingNames = characterNames.filter(name => !receivedNames.includes(name.toLowerCase()));

                    if (missingNames.length > 0) {
                        logger.debug('Fetching missing characters from database', { missingNames });
                        const dbData = getMythicPlusDataFromDB(missingNames);

                        if (dbData.length > 0) {
                            logger.info('Successfully fetched missing characters from database', {
                                dbCount: dbData.length,
                                totalCount: data.length + dbData.length
                            });
                            return [...data, ...dbData];
                        }
                    }
                } catch (dbError) {
                    logger.error('Database fallback failed for missing characters', { error: dbError.message });
                }

                logger.info('Returning partial RaiderIO data', { successCount: data.length, totalCount: characterNames.length });
                return data;
            }

            logger.info('Successfully fetched mythic plus data from RaiderIO', { successCount: data.length, totalCount: characterNames.length });
            return data;
        } catch (error) {
            logger.warn('RaiderIO API failed with error, attempting full database fallback', { error: error.message });

            try {
                const dbData = getMythicPlusDataFromDB(characterNames);
                if (dbData.length > 0) {
                    logger.info('Successfully fetched mythic plus data from database fallback', { count: dbData.length });
                    return dbData;
                }
            } catch (dbError) {
                logger.error('Database fallback also failed', { error: dbError.message });
            }

            logger.error('Both RaiderIO and database failed for mythic plus data');
            return [];
        }
    },
    /**
     * Fetches raid progression data for all configured characters
     * Retrieves boss kill counts across all difficulty levels for current and past raid tiers
     *
     * @returns {Promise<Array>} Array of character objects with raid progression data
     * @throws {Error} If character configuration cannot be loaded
     *
     * @example
     * const raidData = await get_raid_data();
     * raidData.forEach(char => {
     *   char.prog.forEach(raid => {
     *     console.log(`${char.name} in ${raid.name}: ${raid.summary}`);
     *   });
     * });
     */
    get_raid_data: async function () {
        const characterNames = getCharacterNames();

        if (characterNames.length === 0) {
            logger.warn('No characters to fetch raid data for');
            return [];
        }

        logger.info('Fetching raid progression data', { characterCount: characterNames.length });

        try {
            const data = await raiderIOClient.getRaidData(characterNames);
            logger.info('Successfully fetched raid data', { successCount: data.length, totalCount: characterNames.length });
            return data;
        } catch (error) {
            logger.error('Failed to fetch character raid data', { error: error.message });
            return [];
        }
    },
    /**
     * Fetches recent mythic plus runs data for all configured characters
     * Retrieves the most recent dungeon runs completed by each character
     * Used for weekly activity tracking and performance analysis
     * Falls back to database if RaiderIO is unavailable
     *
     * @returns {Promise<Array>} Array of character objects with recent run data
     * @throws {Error} If character configuration cannot be loaded
     *
     * @example
     * const mplusData = await get_mplus_data();
     * mplusData.forEach(char => {
     *   const weeklyRuns = char.recent_runs.filter(run => {
     *     const runDate = new Date(run.completed_at);
     *     return runDate >= lastWeeklyReset;
     *   });
     *   console.log(`${char.name}: ${weeklyRuns.length} runs this week`);
     * });
     */
    get_mplus_data: async function () {
        const characterNames = getCharacterNames();

        if (characterNames.length === 0) {
            logger.warn('No characters to fetch M+ data for');
            return [];
        }

        logger.info('Fetching recent M+ runs data', { characterCount: characterNames.length });

        try {
            const data = await raiderIOClient.getRecentRunsData(characterNames);

            // If RaiderIO returns incomplete results, fill in missing characters from database
            if (data.length < characterNames.length) {
                logger.warn('RaiderIO returned incomplete data, attempting database fallback for missing characters', {
                    requestedCharacters: characterNames.length,
                    receivedCharacters: data.length,
                    missingCount: characterNames.length - data.length
                });

                try {
                    // Find which characters are missing from RaiderIO response
                    const receivedNames = data.map(char => char.name.toLowerCase());
                    const missingNames = characterNames.filter(name => !receivedNames.includes(name.toLowerCase()));

                    if (missingNames.length > 0) {
                        logger.debug('Fetching missing characters from database', { missingNames });
                        const dbData = getRecentRunsFromDB(missingNames);

                        if (dbData.length > 0) {
                            logger.info('Successfully fetched missing characters from database', {
                                dbCount: dbData.length,
                                totalCount: data.length + dbData.length
                            });
                            return [...data, ...dbData];
                        }
                    }
                } catch (dbError) {
                    logger.error('Database fallback failed for missing characters', { error: dbError.message });
                }

                logger.info('Returning partial RaiderIO data', { successCount: data.length, totalCount: characterNames.length });
                return data;
            }

            logger.info('Successfully fetched M+ data from RaiderIO', { successCount: data.length, totalCount: characterNames.length });
            return data;
        } catch (error) {
            logger.warn('RaiderIO API failed with error, attempting full database fallback', { error: error.message });

            try {
                const dbData = getRecentRunsFromDB(characterNames);
                if (dbData.length > 0) {
                    logger.info('Successfully fetched M+ data from database fallback', { count: dbData.length });
                    return dbData;
                }
            } catch (dbError) {
                logger.error('Database fallback also failed', { error: dbError.message });
            }

            logger.error('Both RaiderIO and database failed for recent runs data');
            return [];
        }
    },
    /**
     * Generates external links for all configured characters
     * Creates links to RaiderIO and WarcraftLogs for each character
     * This is a synchronous operation that doesn't require API calls
     *
     * @returns {Array} Array of character link objects
     * @throws {Error} If character configuration cannot be loaded
     *
     * @example
     * const links = get_links();
     * links.forEach(link => {
     *   console.log(`${link.name}: ${link.raiderIoLink}`);
     * });
     */
    get_links: function () {
        const characterNames = getCharacterNames();

        if (characterNames.length === 0) {
            logger.warn('No characters to generate links for');
            return [];
        }

        logger.info('Generating character links', { characterCount: characterNames.length });

        try {
            return raiderIOClient.generateCharacterLinks(characterNames);
        } catch (error) {
            logger.error('Failed to generate character links', { error: error.message });
            return [];
        }
    },
    /**
     * Fetches equipment/gear data for all configured characters
     * Retrieves detailed information about each character's currently equipped items
     * Includes item levels, names, and tier set information
     *
     * @returns {Promise<Array>} Array of character objects with gear data
     * @throws {Error} If character configuration cannot be loaded
     *
     * @example
     * const gearData = await get_gear_data();
     * gearData.forEach(char => {
     *   console.log(`${char.name} item level: ${char.item_level}`);
     *   Object.keys(char.items).forEach(slot => {
     *     const item = char.items[slot];
     *     console.log(`  ${slot}: ${item.name} (${item.item_level})`);
     *   });
     * });
     */
    get_gear_data: async function () {
        const characterNames = getCharacterNames();

        if (characterNames.length === 0) {
            logger.warn('No characters to fetch gear data for');
            return [];
        }

        logger.info('Fetching gear data', { characterCount: characterNames.length });

        try {
            const data = await raiderIOClient.getGearData(characterNames);
            logger.info('Successfully fetched gear data', { successCount: data.length, totalCount: characterNames.length });
            return data;
        } catch (error) {
            logger.error('Failed to fetch character gear data', { error: error.message });
            return [];
        }
    },

    /**
     * Gets the configured character names
     * Exposed for use by other modules that need access to the character list
     *
     * @returns {Array<string>} Array of character names from config
     * @throws {Error} If character configuration cannot be loaded
     */
    getCharacterNames
};