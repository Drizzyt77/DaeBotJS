/**
 * Blizzard API Client Service
 * Handles OAuth authentication and interactions with Blizzard's WoW API
 * Provides role/spec-specific mythic+ run data not available in RaiderIO
 */

const logger = require('../utils/logger');

/**
 * Base configuration for Blizzard API requests
 */
const BLIZZARD_CONFIG = {
    OAUTH_URL: 'https://oauth.battle.net/token',
    API_BASE_URL: 'https://us.api.blizzard.com',
    DEFAULT_REGION: 'us',
    DEFAULT_REALM: 'thrall',
    DEFAULT_NAMESPACE: 'profile-us',
    DEFAULT_LOCALE: 'en_US',
    REQUEST_TIMEOUT: 10000, // 10 seconds
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1 second base delay
    TOKEN_REFRESH_BUFFER: 300 // Refresh token 5 minutes before expiry
};

/**
 * Custom error class for Blizzard API specific errors
 */
class BlizzardAPIError extends Error {
    constructor(message, statusCode = null, characterName = null) {
        super(message);
        this.name = 'BlizzardAPIError';
        this.statusCode = statusCode;
        this.characterName = characterName;
    }
}

/**
 * Blizzard API Client class
 * Handles OAuth token management and API requests
 */
class BlizzardClient {
    constructor(config = {}) {
        this.config = { ...BLIZZARD_CONFIG, ...config };
        this.accessToken = null;
        this.tokenExpiry = null;

        // Load credentials and settings from config or environment
        try {
            const appConfig = require('../config.json');
            this.clientId = config.clientId || appConfig.blizzardClientId || process.env.BLIZZARD_CLIENT_ID;
            this.clientSecret = config.clientSecret || appConfig.blizzardClientSecret || process.env.BLIZZARD_CLIENT_SECRET;

            // Override default region/realm if specified in config
            if (appConfig.region) {
                this.config.DEFAULT_REGION = appConfig.region;
            }
            if (appConfig.realm) {
                this.config.DEFAULT_REALM = appConfig.realm;
            }
        } catch (error) {
            this.clientId = process.env.BLIZZARD_CLIENT_ID;
            this.clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
        }

        if (!this.clientId || !this.clientSecret) {
            logger.warn('Blizzard API credentials not configured. Add blizzardClientId and blizzardClientSecret to config.json');
        }

        logger.info('Blizzard API client initialized', {
            configured: this.isConfigured(),
            region: this.config.DEFAULT_REGION,
            realm: this.config.DEFAULT_REALM
        });
    }

    /**
     * Checks if credentials are configured
     * @returns {boolean} True if credentials are set
     */
    isConfigured() {
        return !!(this.clientId && this.clientSecret);
    }

    /**
     * Checks if the current access token is valid
     * @returns {boolean} True if token is valid and not expired
     */
    isTokenValid() {
        if (!this.accessToken || !this.tokenExpiry) {
            return false;
        }

        const now = Date.now();
        const bufferTime = this.config.TOKEN_REFRESH_BUFFER * 1000;
        return now < (this.tokenExpiry - bufferTime);
    }

    /**
     * Obtains a new OAuth access token from Blizzard
     * Uses client credentials flow for public data access
     * @returns {Promise<string>} Access token
     * @throws {BlizzardAPIError} When authentication fails
     */
    async getAccessToken() {
        // Return cached token if still valid
        if (this.isTokenValid()) {
            return this.accessToken;
        }

        if (!this.isConfigured()) {
            throw new BlizzardAPIError('Blizzard API credentials not configured');
        }

        try {
            const startTime = Date.now();
            const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

            const response = await fetch(this.config.OAUTH_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=client_credentials'
            });

            if (!response.ok) {
                const duration = Date.now() - startTime;
                logger.logApiCall('Blizzard OAuth', this.config.OAUTH_URL, duration, false, response.status);
                throw new BlizzardAPIError(
                    `OAuth failed: ${response.status} ${response.statusText}`,
                    response.status
                );
            }

            const data = await response.json();

            // Store token and expiry time
            this.accessToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            const duration = Date.now() - startTime;
            logger.logApiCall('Blizzard OAuth', this.config.OAUTH_URL, duration, true, response.status, {
                expiresIn: data.expires_in
            });

            logger.info('Obtained Blizzard API access token', {
                expiresIn: data.expires_in,
                expiryTime: new Date(this.tokenExpiry).toISOString()
            });

            return this.accessToken;

        } catch (error) {
            if (error instanceof BlizzardAPIError) {
                throw error;
            }
            throw new BlizzardAPIError(`Failed to obtain access token: ${error.message}`);
        }
    }

    /**
     * Builds a complete API URL for character mythic keystone profile
     * @param {string} characterName - Name of the character
     * @param {number} seasonId - Season ID (e.g., for TWW Season 3)
     * @param {string} region - WoW region (default: 'us')
     * @param {string} realm - WoW realm (default: 'thrall')
     * @returns {string} Complete API URL
     */
    buildMythicKeystoneUrl(characterName, seasonId, region = this.config.DEFAULT_REGION, realm = this.config.DEFAULT_REALM) {
        const realmSlug = realm.toLowerCase().replace(/\s+/g, '-');
        const characterSlug = characterName.toLowerCase();

        const params = new URLSearchParams({
            namespace: `profile-${region}`,
            locale: this.config.DEFAULT_LOCALE
        });

        return `${this.config.API_BASE_URL}/profile/wow/character/${realmSlug}/${characterSlug}/mythic-keystone-profile/season/${seasonId}?${params.toString()}`;
    }

    /**
     * Makes an authenticated HTTP request with retry logic
     * @param {string} url - API endpoint URL
     * @param {string} characterName - Character name for error context
     * @returns {Promise<Object>} Parsed API response
     * @throws {BlizzardAPIError} When request fails after all retries
     */
    async makeRequest(url, characterName) {
        // Ensure we have a valid token
        const token = await this.getAccessToken();

        let lastError = null;
        const startTime = Date.now();

        for (let attempt = 1; attempt <= this.config.MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);

                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'User-Agent': 'DaeBotJS/1.0'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const duration = Date.now() - startTime;
                    logger.logApiCall('Blizzard API', url, duration, false, response.status, {
                        characterName,
                        attempt
                    });

                    throw new BlizzardAPIError(
                        `HTTP ${response.status}: ${response.statusText}`,
                        response.status,
                        characterName
                    );
                }

                const data = await response.json();

                // Log successful API call
                const duration = Date.now() - startTime;
                logger.logApiCall('Blizzard API', url, duration, true, response.status, {
                    characterName,
                    attempt,
                    dataSize: JSON.stringify(data).length
                });

                return data;

            } catch (error) {
                lastError = error;

                logger.warn('Blizzard API request attempt failed', {
                    attempt,
                    maxRetries: this.config.MAX_RETRIES,
                    characterName,
                    error: error.message
                });

                // Don't retry on certain error types
                if (error.name === 'AbortError') {
                    throw new BlizzardAPIError(`Request timeout for character ${characterName}`, null, characterName);
                }

                if (error instanceof BlizzardAPIError && error.statusCode === 404) {
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
        throw new BlizzardAPIError(
            `Failed to fetch data for ${characterName} after ${this.config.MAX_RETRIES} attempts: ${lastError.message}`,
            lastError.statusCode,
            characterName
        );
    }

    /**
     * Fetches mythic keystone profile data for a character
     * @param {string} characterName - Character name
     * @param {number} seasonId - Season ID
     * @param {string} region - Region (default: 'us')
     * @param {string} realm - Realm (default: 'thrall')
     * @returns {Promise<Object>} Character mythic keystone data
     */
    async getMythicKeystoneProfile(characterName, seasonId, region = this.config.DEFAULT_REGION, realm = this.config.DEFAULT_REALM) {
        if (!this.isConfigured()) {
            throw new BlizzardAPIError('Blizzard API credentials not configured');
        }

        const url = this.buildMythicKeystoneUrl(characterName, seasonId, region, realm);

        logger.debug('Calling Blizzard mythic keystone API', {
            characterName,
            seasonId,
            region,
            realm,
            url: url.split('?')[0] // Log URL without query params for privacy
        });

        return await this.makeRequest(url, characterName);
    }

    /**
     * Parses mythic keystone profile data to extract spec-specific best runs
     * @param {Object} rawData - Raw API response from Blizzard
     * @param {string} characterName - Character name for validation
     * @returns {Object} Parsed spec-specific run data
     */
    parseMythicKeystoneData(rawData, characterName) {
        const parsed = {
            name: characterName,
            season_id: rawData.season?.id || null,
            mythic_rating: rawData.mythic_rating?.rating || null,
            best_runs: []
        };

        // Parse best runs with spec information
        if (rawData.best_runs && Array.isArray(rawData.best_runs)) {
            parsed.best_runs = rawData.best_runs.map(run => {
                // Find the character in the members array to get their spec
                let specName = null;
                let specId = null;

                if (run.members && Array.isArray(run.members)) {
                    const characterMember = run.members.find(member =>
                        member.character?.name?.toLowerCase() === characterName.toLowerCase()
                    );

                    if (characterMember && characterMember.specialization) {
                        specName = characterMember.specialization.name;
                        specId = characterMember.specialization.id;
                    }
                }

                return {
                    dungeon: run.dungeon?.name || 'Unknown',
                    dungeon_id: run.dungeon?.id || null,
                    mythic_level: run.mythic_level || 0,
                    completed_timestamp: run.completed_timestamp || null,
                    duration: run.duration || 0,
                    keystone_run_id: run.keystone_run_id || null,
                    is_completed_within_time: run.is_completed_within_time || false,
                    mythic_rating: run.mythic_rating?.rating || 0,
                    map_rating: run.map_rating?.rating || 0,
                    // Spec information extracted from members array
                    spec_name: specName,
                    spec_id: specId,
                    // Affixes
                    affixes: (run.keystone_affixes || []).map(affix => ({
                        id: affix.id,
                        name: affix.name
                    }))
                };
            });
        }

        return parsed;
    }

    /**
     * Fetches spec-specific best runs for multiple characters
     * @param {Array<string>} characterNames - Array of character names
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} Array of character spec-specific run data
     */
    async getSpecificRunsForCharacters(characterNames, seasonId) {
        if (!this.isConfigured()) {
            logger.warn('Blizzard API not configured, skipping spec-specific run fetch');
            return [];
        }

        const promises = characterNames.map(async characterName => {
            try {
                logger.debug('Fetching Blizzard mythic keystone profile', {
                    characterName,
                    seasonId
                });

                const rawData = await this.getMythicKeystoneProfile(characterName, seasonId);

                logger.info('Raw Blizzard API response structure', {
                    characterName,
                    hasData: !!rawData,
                    hasBestRuns: !!rawData?.best_runs,
                    bestRunsCount: rawData?.best_runs?.length || 0,
                    firstRunKeys: rawData?.best_runs?.[0] ? Object.keys(rawData.best_runs[0]) : [],
                    firstRunSpecialization: rawData?.best_runs?.[0]?.specialization || null,
                    firstRunSpec: rawData?.best_runs?.[0]?.spec || null,
                    // Log the entire first run to see structure
                    sampleRun: rawData?.best_runs?.[0] || null
                });

                const parsedData = this.parseMythicKeystoneData(rawData, characterName);

                logger.debug('Parsed Blizzard data', {
                    characterName,
                    bestRunsCount: parsedData.best_runs?.length || 0,
                    firstRunSpecName: parsedData.best_runs?.[0]?.spec_name || null
                });

                return parsedData;
            } catch (error) {
                logger.error('Failed to fetch Blizzard mythic keystone data', {
                    characterName,
                    error: error.message,
                    stack: error.stack
                });
                return null; // Return null for failed requests
            }
        });

        const results = await Promise.all(promises);
        return results.filter(result => result !== null);
    }
}

// Export the client class and error for external use
module.exports = {
    BlizzardClient,
    BlizzardAPIError
};
