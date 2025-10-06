/**
 * Character Data Service
 * Provides high-level API for fetching various types of WoW character data
 * Uses the RaiderIO client service for all API interactions with improved error handling
 */

const { RaiderIOClient } = require('../services/raiderio-client');
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
            logger.info('Successfully fetched mythic plus data', { successCount: data.length, totalCount: characterNames.length });
            return data;
        } catch (error) {
            logger.error('Failed to fetch character mythic plus data', { error: error.message });
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
            logger.info('Successfully fetched M+ data', { successCount: data.length, totalCount: characterNames.length });
            return data;
        } catch (error) {
            logger.error('Failed to fetch character M+ data', { error: error.message });
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