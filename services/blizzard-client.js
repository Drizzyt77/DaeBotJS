/**
 * Blizzard API Client for WoW Character Data
 *
 * Purpose: Fetch accurate spec data for mythic+ runs
 * Used in conjunction with Raider.IO to enrich run data with correct specialization info
 */

const logger = require('../utils/logger');

/**
 * Current Mythic Keystone Season ID
 * Update this when a new season starts
 *
 * Season History:
 * - Season 13: TWW Season 2
 * - Season 14: TWW Season 2.5
 * - Season 15: TWW Season 3
 */
const CURRENT_BLIZZARD_SEASON = 15;

const BLIZZARD_CONFIG = {
    OAUTH_URL: 'https://oauth.battle.net/token',
    API_BASE_URL: 'https://us.api.blizzard.com',
    DEFAULT_REGION: 'us',
    DEFAULT_REALM: 'thrall',
    REQUEST_TIMEOUT: 10000,
    MAX_RETRIES: 2,
    RETRY_DELAY: 1000
};

/**
 * Blizzard API Client with OAuth2 authentication
 */
class BlizzardClient {
    constructor() {
        this.config = BLIZZARD_CONFIG;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.clientId = null;
        this.clientSecret = null;
    }

    /**
     * Configure the client with credentials
     * @param {string} clientId - Blizzard API client ID
     * @param {string} clientSecret - Blizzard API client secret
     */
    configure(clientId, clientSecret) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        logger.debug('Blizzard API client configured');
    }

    /**
     * Check if client is configured with credentials
     * @returns {boolean}
     */
    isConfigured() {
        return !!(this.clientId && this.clientSecret);
    }

    /**
     * Get OAuth access token (with caching)
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        // Return cached token if valid
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        if (!this.isConfigured()) {
            throw new Error('Blizzard API client not configured. Set BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET.');
        }

        try {
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
                throw new Error(`OAuth failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            this.accessToken = data.access_token;
            // Set expiry to 1 hour from now (tokens typically last 24h, but we refresh hourly to be safe)
            this.tokenExpiry = Date.now() + (60 * 60 * 1000);

            logger.debug('Blizzard OAuth token acquired', {
                expiresIn: data.expires_in,
                tokenType: data.token_type
            });

            return this.accessToken;

        } catch (error) {
            logger.error('Failed to get Blizzard OAuth token', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Make an authenticated request to Blizzard API
     * @param {string} endpoint - API endpoint path
     * @param {string} namespace - API namespace (e.g., 'profile-us')
     * @returns {Promise<Object>} API response data
     */
    async makeRequest(endpoint, namespace = 'profile-us') {
        const token = await this.getAccessToken();
        const url = `${this.config.API_BASE_URL}${endpoint}?namespace=${namespace}&locale=en_US`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Battlenet-Namespace': namespace
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                logger.warn('Blizzard API request failed', {
                    status: response.status,
                    endpoint,
                    error: errorText
                });
                return null;
            }

            const data = await response.json();
            return data;

        } catch (error) {
            logger.error('Blizzard API request error', {
                endpoint,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Get mythic keystone profile for a character
     * Returns runs with accurate spec information
     * @param {string} characterName - Character name
     * @param {string} realm - Realm slug (default: 'thrall')
     * @param {string} region - Region (default: 'us')
     * @returns {Promise<Object|null>} Mythic keystone profile data
     */
    async getMythicKeystoneProfile(characterName, realm = 'thrall', region = 'us') {
        if (!this.isConfigured()) {
            logger.debug('Blizzard API not configured, skipping spec lookup');
            return null;
        }

        const realmSlug = realm.toLowerCase().replace(/'/g, '').replace(/\s+/g, '-');
        const charNameLower = characterName.toLowerCase();
        const endpoint = `/profile/wow/character/${realmSlug}/${charNameLower}/mythic-keystone-profile`;
        const namespace = `profile-${region}`;

        logger.debug('Fetching Blizzard mythic keystone profile', {
            characterName,
            realm: realmSlug,
            endpoint
        });

        return await this.makeRequest(endpoint, namespace);
    }

    /**
     * Get current mythic keystone season details for a character
     * @param {string} characterName - Character name
     * @param {string} realm - Realm slug
     * @param {string} region - Region
     * @param {number} seasonId - Season ID (defaults to current season)
     * @returns {Promise<Object|null>} Season details with runs
     */
    async getCurrentSeasonProfile(characterName, realm = 'thrall', region = 'us', seasonId = CURRENT_BLIZZARD_SEASON) {
        if (!this.isConfigured()) {
            return null;
        }

        const realmSlug = realm.toLowerCase().replace(/'/g, '').replace(/\s+/g, '-');
        const charNameLower = characterName.toLowerCase();
        const endpoint = `/profile/wow/character/${realmSlug}/${charNameLower}/mythic-keystone-profile`;
        const namespace = `profile-${region}`;

        logger.debug('Fetching Blizzard current season profile', {
            characterName,
            realm: realmSlug,
            season: seasonId
        });

        return await this.makeRequest(endpoint, namespace);
    }

    /**
     * Extract spec data from Blizzard runs
     * Creates a map of run identifiers to spec names
     * @param {Object} seasonProfile - Season profile data from Blizzard
     * @param {string} characterName - Character name for matching
     * @returns {Map} Map of run keys to spec info
     */
    extractSpecData(seasonProfile, characterName) {
        const specMap = new Map();

        if (!seasonProfile) {
            return specMap;
        }

        // Get best runs from either current_period or direct best_runs property
        const bestRuns = seasonProfile.current_period?.best_runs || seasonProfile.best_runs;

        if (!bestRuns || !Array.isArray(bestRuns)) {
            logger.warn('No best runs found in Blizzard profile', {
                characterName,
                hasCurrentPeriod: !!seasonProfile.current_period,
                hasBestRuns: !!seasonProfile.best_runs
            });
            return specMap;
        }

        logger.debug('Processing Blizzard runs for spec extraction', {
            characterName,
            runsFound: bestRuns.length
        });

        for (const run of bestRuns) {
            if (!run.members) continue;

            // Find the character in the run members
            const member = run.members.find(m =>
                m.character?.name?.toLowerCase() === characterName.toLowerCase()
            );

            if (member && member.specialization) {
                // Create a unique key for this run (dungeon + mythic_level + completed_timestamp)
                const completedTimestamp = run.completed_timestamp; // Already in milliseconds
                const key = `${run.dungeon.name}_${run.keystone_level}_${completedTimestamp}`;

                specMap.set(key, {
                    spec_name: member.specialization.name,
                    spec_id: member.specialization.id,
                    role: this.getSpecRole(member.specialization.name)
                });

                logger.debug('Extracted spec from Blizzard run', {
                    dungeon: run.dungeon.name,
                    level: run.keystone_level,
                    spec: member.specialization.name,
                    timestamp: completedTimestamp,
                    key: key,
                    completed_at_iso: new Date(completedTimestamp).toISOString()
                });
            }
        }

        logger.info('Extracted spec data from Blizzard', {
            characterName,
            runsWithSpec: specMap.size
        });

        return specMap;
    }

    /**
     * Get role from spec name
     * @param {string} specName - Specialization name
     * @returns {string} Role (TANK, HEALING, DPS)
     */
    getSpecRole(specName) {
        const tankSpecs = ['Blood', 'Vengeance', 'Protection', 'Guardian', 'Brewmaster'];
        const healerSpecs = ['Discipline', 'Holy', 'Restoration', 'Mistweaver', 'Preservation'];

        if (tankSpecs.includes(specName)) return 'TANK';
        if (healerSpecs.includes(specName)) return 'HEALING';
        return 'DPS';
    }
}

module.exports = { BlizzardClient, CURRENT_BLIZZARD_SEASON };
