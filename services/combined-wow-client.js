/**
 * Combined WoW API Client Service
 * Merges data from RaiderIO and Blizzard APIs to provide comprehensive character information
 * - RaiderIO: Overall M+ scores, best runs, rankings
 * - Blizzard: Spec-specific runs, detailed run information
 */

const { RaiderIOClient } = require('./raiderio-client');
const { BlizzardClient } = require('./blizzard-client');
const logger = require('../utils/logger');

/**
 * Combined WoW API Client
 * Orchestrates calls to both RaiderIO and Blizzard APIs
 */
class CombinedWowClient {
    constructor(config = {}) {
        this.raiderIO = new RaiderIOClient(config.raiderIO || {});
        this.blizzard = new BlizzardClient(config.blizzard || {});

        // Load current season ID from config
        try {
            const appConfig = require('../config.json');
            this.currentSeasonId = config.seasonId || appConfig.currentSeasonId || 13; // TWW Season 3
        } catch (error) {
            this.currentSeasonId = config.seasonId || 13;
        }

        logger.info('Combined WoW API client initialized', {
            seasonId: this.currentSeasonId,
            blizzardConfigured: this.blizzard.isConfigured()
        });
    }

    /**
     * Groups runs by spec for a character
     * @param {Array} runs - Array of runs with spec information
     * @returns {Object} Runs grouped by spec name
     */
    groupRunsBySpec(runs) {
        const grouped = {};

        runs.forEach(run => {
            const specName = run.spec_name || 'Unknown';
            if (!grouped[specName]) {
                grouped[specName] = [];
            }
            grouped[specName].push(run);
        });

        return grouped;
    }

    /**
     * Merges RaiderIO and Blizzard data for a single character
     * @param {Object} raiderIOData - Character data from RaiderIO
     * @param {Object} blizzardData - Character data from Blizzard
     * @returns {Object} Combined character data
     */
    mergeCharacterData(raiderIOData, blizzardData) {
        const merged = {
            name: raiderIOData.name,
            class: raiderIOData.class,
            role: raiderIOData.role,

            // RaiderIO specific data
            mythic_plus_scores: raiderIOData.mythic_plus_scores_by_season || null,
            overall_score: raiderIOData.mythic_plus_scores_by_season?.[0]?.scores?.all || 0,

            // Best runs from RaiderIO (overall best regardless of spec)
            best_runs: raiderIOData.mythic_plus_runs || [],

            // Spec-specific data from Blizzard
            spec_specific_runs: null,
            runs_by_spec: null,
            available_specs: []
        };

        // Add Blizzard spec-specific data if available
        if (blizzardData && blizzardData.best_runs) {
            merged.spec_specific_runs = blizzardData.best_runs;
            merged.runs_by_spec = this.groupRunsBySpec(blizzardData.best_runs);
            merged.available_specs = Object.keys(merged.runs_by_spec);
            merged.mythic_rating = blizzardData.mythic_rating;

            logger.debug('Merged spec-specific data for character', {
                characterName: merged.name,
                specsFound: merged.available_specs,
                totalRuns: blizzardData.best_runs.length
            });
        } else {
            logger.debug('No Blizzard data available for character', {
                characterName: merged.name
            });
        }

        return merged;
    }

    /**
     * Fetches comprehensive character data combining both APIs
     * @param {Array<string>} characterNames - Array of character names
     * @returns {Promise<Array>} Combined character data
     */
    async getEnhancedCharacterData(characterNames) {
        logger.info('Fetching enhanced character data', {
            characterCount: characterNames.length,
            blizzardEnabled: this.blizzard.isConfigured()
        });

        try {
            // Fetch from both APIs in parallel
            const [raiderIOData, blizzardData] = await Promise.all([
                // Get basic M+ data and scores from RaiderIO
                this.raiderIO.fetchCharacterData(
                    characterNames,
                    'mythic_plus_best_runs,mythic_plus_scores_by_season:current',
                    (rawData, characterName) => ({
                        name: rawData.name,
                        class: rawData.class,
                        role: rawData.active_spec_role,
                        mythic_plus_runs: (rawData.mythic_plus_best_runs || []).map(run => ({
                            dungeon: run.dungeon,
                            mythic_level: run.mythic_level,
                            score: run.score,
                            timed: run.num_keystone_upgrades
                        })),
                        mythic_plus_scores_by_season: rawData.mythic_plus_scores_by_season || []
                    })
                ),

                // Get spec-specific runs from Blizzard (if configured)
                this.blizzard.isConfigured()
                    ? this.blizzard.getSpecificRunsForCharacters(characterNames, this.currentSeasonId)
                    : Promise.resolve([])
            ]);

            // Merge the data from both sources
            const mergedData = raiderIOData.map(rioChar => {
                const blizzardChar = blizzardData.find(bc =>
                    bc && bc.name.toLowerCase() === rioChar.name.toLowerCase()
                );
                return this.mergeCharacterData(rioChar, blizzardChar);
            });

            logger.info('Enhanced character data fetch complete', {
                characterCount: mergedData.length,
                withSpecData: mergedData.filter(c => c.spec_specific_runs).length
            });

            return mergedData;

        } catch (error) {
            logger.error('Failed to fetch enhanced character data', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Gets spec-specific best runs for a character
     * Useful for filtering runs by a specific spec
     * @param {string} characterName - Character name
     * @param {string} specName - Spec name to filter (optional, returns all if not provided)
     * @returns {Promise<Array>} Spec-specific runs
     */
    async getSpecificRuns(characterName, specName = null) {
        if (!this.blizzard.isConfigured()) {
            logger.warn('Blizzard API not configured, cannot fetch spec-specific runs');
            return [];
        }

        try {
            logger.debug('Calling Blizzard API for spec-specific runs', {
                characterName,
                specName,
                seasonId: this.currentSeasonId
            });

            const data = await this.blizzard.getSpecificRunsForCharacters([characterName], this.currentSeasonId);

            logger.debug('Blizzard API response received', {
                characterName,
                dataLength: data?.length || 0,
                firstCharacterName: data?.[0]?.name,
                bestRunsCount: data?.[0]?.best_runs?.length || 0,
                firstRunSpecName: data?.[0]?.best_runs?.[0]?.spec_name || null
            });

            if (!data || data.length === 0) {
                logger.warn('No data returned from Blizzard API', { characterName });
                return [];
            }

            const characterData = data[0];

            if (!characterData.best_runs || characterData.best_runs.length === 0) {
                logger.warn('Character data has no best_runs', {
                    characterName,
                    characterDataKeys: Object.keys(characterData)
                });
                return [];
            }

            // Log all unique specs in the data
            const uniqueSpecs = [...new Set(characterData.best_runs
                .map(run => run.spec_name)
                .filter(Boolean))];

            logger.info('Specs found in Blizzard data', {
                characterName,
                specs: uniqueSpecs,
                requestedSpec: specName,
                totalRuns: characterData.best_runs.length,
                runsWithSpecName: characterData.best_runs.filter(r => r.spec_name).length,
                runsWithoutSpecName: characterData.best_runs.filter(r => !r.spec_name).length
            });

            // Filter by spec if specified
            if (specName && characterData.best_runs) {
                const filtered = characterData.best_runs.filter(run =>
                    run.spec_name && run.spec_name.toLowerCase() === specName.toLowerCase()
                );

                logger.debug('Filtered runs by spec', {
                    characterName,
                    specName,
                    totalRuns: characterData.best_runs.length,
                    filteredRuns: filtered.length
                });

                return filtered;
            }

            return characterData.best_runs || [];

        } catch (error) {
            logger.error('Failed to fetch spec-specific runs', {
                characterName,
                specName,
                error: error.message,
                stack: error.stack
            });
            return [];
        }
    }

    /**
     * Gets all available specs for a character based on their runs
     * @param {string} characterName - Character name
     * @returns {Promise<Array<string>>} Array of spec names
     */
    async getAvailableSpecs(characterName) {
        if (!this.blizzard.isConfigured()) {
            return [];
        }

        try {
            const data = await this.blizzard.getSpecificRunsForCharacters([characterName], this.currentSeasonId);

            if (!data || data.length === 0) {
                return [];
            }

            const characterData = data[0];
            const specs = new Set();

            if (characterData.best_runs) {
                characterData.best_runs.forEach(run => {
                    if (run.spec_name) {
                        specs.add(run.spec_name);
                    }
                });
            }

            return Array.from(specs);

        } catch (error) {
            logger.error('Failed to fetch available specs', {
                characterName,
                error: error.message
            });
            return [];
        }
    }

    /**
     * Compares runs across different specs for a character
     * Useful for seeing which dungeons were completed on alternate specs
     * @param {string} characterName - Character name
     * @returns {Promise<Object>} Comparison data with runs grouped by spec
     */
    async compareSpecRuns(characterName) {
        if (!this.blizzard.isConfigured()) {
            logger.warn('Blizzard API not configured for spec comparison');
            return { characterName, specs: {}, summary: 'Blizzard API not configured' };
        }

        try {
            const data = await this.blizzard.getSpecificRunsForCharacters([characterName], this.currentSeasonId);

            if (!data || data.length === 0) {
                return { characterName, specs: {}, summary: 'No data available' };
            }

            const characterData = data[0];
            const runsBySpec = this.groupRunsBySpec(characterData.best_runs || []);

            // Calculate summary stats per spec
            const comparison = {
                characterName,
                specs: {},
                summary: {}
            };

            Object.entries(runsBySpec).forEach(([specName, runs]) => {
                comparison.specs[specName] = {
                    runs,
                    totalRuns: runs.length,
                    avgLevel: runs.reduce((sum, r) => sum + r.mythic_level, 0) / runs.length,
                    highestKey: Math.max(...runs.map(r => r.mythic_level)),
                    dungeonsCovered: [...new Set(runs.map(r => r.dungeon))]
                };
            });

            comparison.summary = {
                totalSpecs: Object.keys(runsBySpec).length,
                totalRuns: characterData.best_runs.length,
                specs: Object.keys(runsBySpec)
            };

            return comparison;

        } catch (error) {
            logger.error('Failed to compare spec runs', {
                characterName,
                error: error.message
            });
            return { characterName, specs: {}, summary: 'Error fetching data', error: error.message };
        }
    }
}

module.exports = {
    CombinedWowClient
};
