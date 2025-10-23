/**
 * RaiderIO API Client Service
 * Handles all interactions with the RaiderIO API for fetching WoW character data
 * Provides centralized error handling, request retry logic, and response validation
 */

const logger = require('../utils/logger');

/**
 * Base configuration for RaiderIO API requests
 */
const RAIDERIO_CONFIG = {
    BASE_URL: 'https://raider.io/api/v1/characters/profile',
    DEFAULT_REGION: 'us',
    DEFAULT_REALM: 'Thrall',
    REQUEST_TIMEOUT: 10000, // 10 seconds
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000 // 1 second base delay
};

/**
 * Field mappings for different types of character data requests
 * Each endpoint requires specific fields to be requested from the API
 */
const API_FIELDS = {
    MYTHIC_PLUS: 'mythic_plus_best_runs,mythic_plus_scores_by_season:current',
    RAID_PROGRESSION: 'raid_progression',
    RECENT_RUNS: 'mythic_plus_recent_runs',
    GEAR: 'gear,thumbnail_url'
};

/**
 * Custom error class for RaiderIO API specific errors
 */
class RaiderIOError extends Error {
    constructor(message, statusCode = null, characterName = null) {
        super(message);
        this.name = 'RaiderIOError';
        this.statusCode = statusCode;
        this.characterName = characterName;
    }
}

/**
 * RaiderIO API Client class
 * Provides methods for fetching different types of character data
 */
class RaiderIOClient {
    constructor(config = {}) {
        this.config = { ...RAIDERIO_CONFIG, ...config };
    }

    /**
     * Builds a complete API URL for character data requests
     * @param {string} characterName - Name of the character
     * @param {string} fields - API fields to request (comma-separated)
     * @param {string} region - WoW region (default: 'us')
     * @param {string} realm - WoW realm (default: 'Thrall')
     * @returns {string} Complete API URL
     */
    buildApiUrl(characterName, fields, region = this.config.DEFAULT_REGION, realm = this.config.DEFAULT_REALM) {
        const params = new URLSearchParams({
            region,
            realm,
            name: characterName,
            fields
        });

        return `${this.config.BASE_URL}?${params.toString()}`;
    }

    /**
     * Makes an HTTP request with retry logic and error handling
     * @param {string} url - API endpoint URL
     * @param {string} characterName - Character name for error context
     * @returns {Promise<Object>} Parsed API response
     * @throws {RaiderIOError} When request fails after all retries
     */
    async makeRequest(url, characterName) {
        let lastError = null;
        const startTime = Date.now();

        for (let attempt = 1; attempt <= this.config.MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);

                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'DaeBotJS/1.0'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const duration = Date.now() - startTime;
                    logger.logApiCall('RaiderIO', url, duration, false, response.status, {
                        characterName,
                        attempt,
                        statusText: response.statusText
                    });

                    throw new RaiderIOError(
                        `HTTP ${response.status}: ${response.statusText}`,
                        response.status,
                        characterName
                    );
                }

                const data = await response.json();

                // Validate response has expected structure
                if (!data.name) {
                    throw new RaiderIOError(
                        'Invalid API response: missing character name',
                        null,
                        characterName
                    );
                }

                // Log successful API call
                const duration = Date.now() - startTime;
                logger.logApiCall('RaiderIO', url, duration, true, response.status, {
                    characterName,
                    attempt,
                    dataSize: JSON.stringify(data).length
                });

                return data;

            } catch (error) {
                lastError = error;

                // Log attempt for debugging
                logger.warn('RaiderIO API request attempt failed', { attempt, maxRetries: this.config.MAX_RETRIES, characterName, error: error.message });

                // Don't retry on certain error types
                if (error.name === 'AbortError') {
                    throw new RaiderIOError(`Request timeout for character ${characterName}`, null, characterName);
                }

                if (error instanceof RaiderIOError && error.statusCode === 404) {
                    throw error; // Character not found, don't retry
                }

                // Wait before retrying (exponential backoff)
                if (attempt < this.config.MAX_RETRIES) {
                    const delay = this.config.RETRY_DELAY * Math.pow(2, attempt - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All attempts failed
        throw new RaiderIOError(
            `Failed to fetch data for ${characterName} after ${this.config.MAX_RETRIES} attempts: ${lastError.message}`,
            lastError.statusCode,
            characterName
        );
    }

    /**
     * Fetches character data for multiple characters with a specific field set
     * @param {Array<string|Object>} characters - Array of character names or character objects with {name, realm, region}
     * @param {string} fields - API fields to request
     * @param {Function} dataParser - Function to parse individual character data
     * @returns {Promise<Array>} Array of parsed character data (excludes failed requests)
     */
    async fetchCharacterData(characters, fields, dataParser) {
        const promises = characters.map(async character => {
            // Handle both old format (string) and new format (object)
            let characterName, realm, region;
            if (typeof character === 'string') {
                // Legacy support: just character name
                characterName = character;
                realm = this.config.DEFAULT_REALM;
                region = this.config.DEFAULT_REGION;
            } else if (typeof character === 'object' && character.name) {
                // New format: object with name, realm, region
                characterName = character.name;
                realm = character.realm || this.config.DEFAULT_REALM;
                region = character.region || this.config.DEFAULT_REGION;
            } else {
                logger.warn('Invalid character format', { character });
                return null;
            }

            try {
                const url = this.buildApiUrl(characterName, fields, region, realm);
                const rawData = await this.makeRequest(url, characterName);
                return dataParser(rawData, characterName);
            } catch (error) {
                logger.error('Failed to fetch character data from RaiderIO', {
                    characterName,
                    realm,
                    region,
                    error: error.message
                });
                return null; // Return null for failed requests
            }
        });

        const results = await Promise.all(promises);
        return results.filter(result => result !== null);
    }

    /**
     * Parses mythic plus data from API response
     * @param {Object} rawData - Raw API response
     * @param {string} characterName - Character name for validation
     * @returns {Object} Parsed mythic plus character data
     */
    parseMythicPlusData(rawData, characterName) {
        // Get current season M+ score
        const currentSeasonScores = rawData.mythic_plus_scores_by_season?.[0];
        const mythicPlusScore = currentSeasonScores?.scores?.all || 0;

        return {
            name: rawData.name,
            class: rawData.class,
            role: rawData.active_spec_role,
            mythic_plus_score: mythicPlusScore,
            mythic_plus_runs: (rawData.mythic_plus_best_runs || []).map(run => ({
                dungeon: run.dungeon,
                mythic_level: run.mythic_level,
                score: run.score,
                timed: run.num_keystone_upgrades
            }))
        };
    }

    /**
     * Parses raid progression data from API response
     * @param {Object} rawData - Raw API response
     * @param {string} characterName - Character name for validation
     * @returns {Object} Parsed raid progression character data
     */
    parseRaidData(rawData, characterName) {
        return {
            name: rawData.name,
            class: rawData.class,
            role: rawData.active_spec_role,
            prog: Object.entries(rawData.raid_progression || {}).map(([raidName, raidData]) => ({
                name: raidName,
                summary: raidData.summary,
                normal: raidData.normal_bosses_killed,
                heroic: raidData.heroic_bosses_killed,
                mythic: raidData.mythic_bosses_killed,
                total_bosses: raidData.total_bosses
            }))
        };
    }

    /**
     * Parses recent mythic plus runs data from API response
     * @param {Object} rawData - Raw API response
     * @param {string} characterName - Character name for validation
     * @returns {Object} Parsed recent runs character data
     */
    parseRecentRunsData(rawData, characterName) {
        return {
            name: rawData.name,
            class: rawData.class,
            role: rawData.active_spec_role,
            recent_runs: (rawData.mythic_plus_recent_runs || []).map(run => ({
                dungeon: run.dungeon,
                mythic_level: run.mythic_level,
                score: run.score,
                completed_at: run.completed_at,
                num_keystone_upgrades: run.num_keystone_upgrades
            }))
        };
    }

    /**
     * Parses gear data from API response
     * @param {Object} rawData - Raw API response
     * @param {string} characterName - Character name for validation
     * @returns {Object} Parsed gear character data
     */
    parseGearData(rawData, characterName) {
        const parsedData = {
            name: rawData.name,
            class: rawData.class,
            level: rawData.level || null,
            role: rawData.active_spec_role,
            item_level: rawData.gear?.item_level_equipped || 0,
            thumbnail_url: rawData.thumbnail_url || null,
            items: {}
        };

        // Parse individual equipment items if available
        if (rawData.gear && rawData.gear.items) {
            Object.keys(rawData.gear.items).forEach(slot => {
                const item = rawData.gear.items[slot];
                parsedData.items[slot] = {
                    item_id: item.item_id,
                    item_level: item.item_level,
                    name: item.name,
                    tier: item.tier || null,
                    item_quality: item.item_quality || item.quality || null
                };
            });
        }

        return parsedData;
    }

    // High-level API methods for different data types

    /**
     * Fetches mythic plus data for multiple characters
     * @param {Array<string|Object>} characters - Array of character names or character objects with {name, realm, region}
     * @returns {Promise<Array>} Array of character mythic plus data
     */
    async getMythicPlusData(characters) {
        return this.fetchCharacterData(
            characters,
            API_FIELDS.MYTHIC_PLUS,
            this.parseMythicPlusData.bind(this)
        );
    }

    /**
     * Fetches raid progression data for multiple characters
     * @param {Array<string|Object>} characters - Array of character names or character objects with {name, realm, region}
     * @returns {Promise<Array>} Array of character raid progression data
     */
    async getRaidData(characters) {
        return this.fetchCharacterData(
            characters,
            API_FIELDS.RAID_PROGRESSION,
            this.parseRaidData.bind(this)
        );
    }

    /**
     * Fetches recent mythic plus runs for multiple characters
     * @param {Array<string|Object>} characters - Array of character names or character objects with {name, realm, region}
     * @returns {Promise<Array>} Array of character recent runs data
     */
    async getRecentRunsData(characters) {
        return this.fetchCharacterData(
            characters,
            API_FIELDS.RECENT_RUNS,
            this.parseRecentRunsData.bind(this)
        );
    }

    /**
     * Fetches gear data for multiple characters
     * @param {Array<string>} characterNames - Array of character names
     * @returns {Promise<Array>} Array of character gear data
     */
    async getGearData(characterNames) {
        return this.fetchCharacterData(
            characterNames,
            API_FIELDS.GEAR,
            this.parseGearData.bind(this)
        );
    }

    /**
     * Generates character links for external services
     * @param {Array<string>} characterNames - Array of character names
     * @param {string} region - WoW region (default: 'us')
     * @param {string} realm - WoW realm (default: 'thrall')
     * @returns {Array} Array of character link objects
     */
    generateCharacterLinks(characterNames, region = 'us', realm = 'thrall') {
        const realmSlug = realm.toLowerCase();

        return characterNames.map(characterName => ({
            name: characterName,
            raiderIoLink: `https://raider.io/characters/${region}/${realmSlug}/${characterName}`,
            warcraftlogsLink: `https://www.warcraftlogs.com/character/${region}/${realmSlug}/${characterName}`
        }));
    }
}

// Export the client class and error for external use
module.exports = {
    RaiderIOClient,
    RaiderIOError,
    API_FIELDS
};