/**
 * Mythic+ Run Collector Service
 *
 * Fetches recent M+ runs from Raider.IO API and stores them in the local database.
 * Handles deduplication, spec inference, and batch processing.
 *
 * Features:
 * - Fetches mythic_plus_recent_runs from Raider.IO
 * - Infers spec from character's active spec (limitation of Raider.IO API)
 * - Batch processing for multiple characters
 * - Automatic deduplication using unique keys
 * - Season tracking
 */

const { getDatabase } = require('../database/mythic-runs-db');
const { RaiderIOClient } = require('./raiderio-client');
const { BlizzardClient } = require('./blizzard-client');
const logger = require('../utils/logger');

/**
 * Current season identifier
 * Update this when a new season starts
 */
const CURRENT_SEASON = 'season-tww-3';

/**
 * RunCollector class
 * Manages fetching and storing M+ runs
 */
class RunCollector {
    constructor() {
        this.db = getDatabase();
        this.raiderIO = new RaiderIOClient();
        this.blizzard = new BlizzardClient();

        // Configure Blizzard client if credentials are available
        const blizzardClientId = process.env.BLIZZARD_CLIENT_ID;
        const blizzardClientSecret = process.env.BLIZZARD_CLIENT_SECRET;

        if (blizzardClientId && blizzardClientSecret) {
            this.blizzard.configure(blizzardClientId, blizzardClientSecret);
            logger.info('Blizzard API client configured for accurate spec data');
        } else {
            logger.warn('Blizzard API credentials not found - using fallback spec tagging (character active spec)');
        }
    }

    /**
     * Fetch accurate spec data from Blizzard API
     * @param {string} characterName - Character name
     * @param {string} realm - Realm
     * @param {string} region - Region
     * @returns {Promise<Map>} Map of run keys to spec data
     */
    async fetchBlizzardSpecData(characterName, realm, region) {
        if (!this.blizzard.isConfigured()) {
            logger.debug('Blizzard API not configured, skipping spec lookup');
            return new Map();
        }

        try {
            // Fetch current season profile from Blizzard
            const seasonProfile = await this.blizzard.getCurrentSeasonProfile(characterName, realm, region);

            if (!seasonProfile) {
                logger.debug('No Blizzard season profile found', { characterName });
                return new Map();
            }

            // Extract spec data from Blizzard runs
            const specMap = this.blizzard.extractSpecData(seasonProfile, characterName);

            logger.info('Fetched accurate spec data from Blizzard', {
                characterName,
                runsWithAccurateSpec: specMap.size
            });

            return specMap;

        } catch (error) {
            logger.warn('Failed to fetch Blizzard spec data, using fallback', {
                characterName,
                error: error.message
            });
            return new Map();
        }
    }

    /**
     * Get spec for a run, preferring Blizzard data over fallback
     * @param {Object} run - Run data from Raider.IO
     * @param {Map} blizzardSpecMap - Map of Blizzard spec data
     * @param {string} fallbackSpecName - Fallback spec name (character's current spec)
     * @param {string} fallbackSpecRole - Fallback spec role
     * @returns {Object} Spec data {spec_name, spec_role, source}
     */
    getRunSpec(run, blizzardSpecMap, fallbackSpecName, fallbackSpecRole) {
        // Create key to match with Blizzard data
        const completedTimestamp = new Date(run.completed_at).getTime();
        const key = `${run.dungeon}_${run.mythic_level}_${completedTimestamp}`;

        // Check if we have Blizzard spec data for this run
        const blizzardSpec = blizzardSpecMap.get(key);

        if (blizzardSpec) {
            return {
                spec_name: blizzardSpec.spec_name,
                spec_role: blizzardSpec.role,
                source: 'blizzard'
            };
        }

        // Fall back to character's current active spec
        return {
            spec_name: fallbackSpecName,
            spec_role: fallbackSpecRole,
            source: 'fallback'
        };
    }

    /**
     * Collect best runs (per dungeon) for a single character
     * @param {string} characterName - Character name
     * @param {Object} options - Collection options
     * @returns {Promise<Object>} Collection results
     */
    async collectBestRuns(characterName, options = {}) {
        const {
            realm = 'thrall',
            region = 'us',
            season = CURRENT_SEASON
        } = options;

        try {
            logger.info('Collecting best runs for character', { characterName, realm, region });

            // Fetch character data with best runs AND alternate runs for more coverage
            const characterData = await this.raiderIO.fetchCharacterData(
                [characterName],
                'mythic_plus_best_runs,mythic_plus_alternate_runs,mythic_plus_scores_by_season:current,gear',
                (rawData) => ({
                    name: rawData.name,
                    class: rawData.class,
                    active_spec_name: rawData.active_spec_name,
                    active_spec_role: rawData.active_spec_role,
                    best_runs: rawData.mythic_plus_best_runs || [],
                    alternate_runs: rawData.mythic_plus_alternate_runs || [],
                    scores: rawData.mythic_plus_scores_by_season || []
                })
            );

            if (!characterData || characterData.length === 0) {
                logger.warn('No character data found', { characterName });
                return { character: characterName, runs_added: 0, runs_skipped: 0, error: 'Character not found' };
            }

            const charData = characterData[0];

            // Upsert character record
            const characterId = this.db.upsertCharacter({
                name: charData.name,
                realm,
                region,
                class: charData.class,
                active_spec_name: charData.active_spec_name,
                active_spec_role: charData.active_spec_role
            });

            logger.debug('Character upserted for best runs', {
                characterId,
                name: charData.name,
                active_spec: charData.active_spec_name
            });

            // Fetch accurate spec data from Blizzard API
            const blizzardSpecMap = await this.fetchBlizzardSpecData(characterName, realm, region);

            // Process best runs and alternate runs
            const results = {
                character: characterName,
                runs_added: 0,
                runs_skipped: 0,
                accurate_specs: 0,
                fallback_specs: 0
            };

            // Combine best runs and alternate runs
            const allRuns = [...charData.best_runs, ...charData.alternate_runs];

            for (const run of allRuns) {
                // Get spec data (accurate from Blizzard or fallback to active spec)
                const specData = this.getRunSpec(
                    run,
                    blizzardSpecMap,
                    charData.active_spec_name,
                    charData.active_spec_role
                );

                // Track spec accuracy
                if (specData.source === 'blizzard') {
                    results.accurate_specs++;
                } else {
                    results.fallback_specs++;
                }

                // Convert Raider.IO run format to database format
                const runData = {
                    dungeon: run.dungeon,
                    mythic_level: run.mythic_level,
                    completed_timestamp: new Date(run.completed_at).getTime(),
                    duration: run.clear_time_ms || 0,
                    keystone_run_id: run.mythic_plus_id || null,
                    is_completed_within_time: run.num_keystone_upgrades > 0,
                    score: run.score || 0,
                    num_keystone_upgrades: run.num_keystone_upgrades || 0,
                    spec_name: specData.spec_name,
                    spec_role: specData.spec_role,
                    affixes: run.affixes || [],
                    season: season
                };

                const insertResult = this.db.insertRun(characterId, runData);

                if (insertResult.inserted) {
                    results.runs_added++;
                    logger.debug('Best run inserted', {
                        character: characterName,
                        dungeon: runData.dungeon,
                        level: runData.mythic_level,
                        spec: runData.spec_name,
                        specSource: specData.source
                    });
                } else {
                    results.runs_skipped++;
                }
            }

            logger.info('Best runs collection complete for character', {
                character: characterName,
                runs_added: results.runs_added,
                runs_skipped: results.runs_skipped,
                total_runs: allRuns.length,
                accurate_specs: results.accurate_specs,
                fallback_specs: results.fallback_specs,
                spec_accuracy_rate: allRuns.length > 0
                    ? `${((results.accurate_specs / allRuns.length) * 100).toFixed(1)}%`
                    : '0%'
            });

            return results;

        } catch (error) {
            logger.error('Failed to collect best runs for character', {
                character: characterName,
                error: error.message,
                stack: error.stack
            });
            return {
                character: characterName,
                runs_added: 0,
                runs_skipped: 0,
                error: error.message
            };
        }
    }

    /**
     * Collect recent runs for a single character
     * @param {string} characterName - Character name
     * @param {Object} options - Collection options
     * @returns {Promise<Object>} Collection results
     */
    async collectCharacterRuns(characterName, options = {}) {
        const {
            realm = 'thrall',
            region = 'us',
            season = CURRENT_SEASON
        } = options;

        try {
            logger.info('Collecting runs for character', { characterName, realm, region });

            // Fetch character data with recent runs AND current character info
            const characterData = await this.raiderIO.fetchCharacterData(
                [characterName],
                'mythic_plus_recent_runs,mythic_plus_scores_by_season:current,gear',
                (rawData) => ({
                    name: rawData.name,
                    class: rawData.class,
                    active_spec_name: rawData.active_spec_name,
                    active_spec_role: rawData.active_spec_role,
                    recent_runs: rawData.mythic_plus_recent_runs || [],
                    scores: rawData.mythic_plus_scores_by_season || []
                })
            );

            if (!characterData || characterData.length === 0) {
                logger.warn('No character data found', { characterName });
                return { character: characterName, runs_added: 0, runs_skipped: 0, error: 'Character not found' };
            }

            const charData = characterData[0];

            // Upsert character record
            const characterId = this.db.upsertCharacter({
                name: charData.name,
                realm,
                region,
                class: charData.class,
                active_spec_name: charData.active_spec_name,
                active_spec_role: charData.active_spec_role
            });

            logger.debug('Character upserted', {
                characterId,
                name: charData.name,
                active_spec: charData.active_spec_name
            });

            // Fetch accurate spec data from Blizzard API
            const blizzardSpecMap = await this.fetchBlizzardSpecData(characterName, realm, region);

            // Process recent runs
            const results = {
                character: characterName,
                runs_added: 0,
                runs_skipped: 0,
                accurate_specs: 0,
                fallback_specs: 0
            };

            for (const run of charData.recent_runs) {
                // Get spec data (accurate from Blizzard or fallback to active spec)
                const specData = this.getRunSpec(
                    run,
                    blizzardSpecMap,
                    charData.active_spec_name,
                    charData.active_spec_role
                );

                // Track spec accuracy
                if (specData.source === 'blizzard') {
                    results.accurate_specs++;
                } else {
                    results.fallback_specs++;
                }

                // Convert Raider.IO run format to database format
                const runData = {
                    dungeon: run.dungeon,
                    mythic_level: run.mythic_level,
                    completed_timestamp: new Date(run.completed_at).getTime(),
                    duration: run.clear_time_ms || 0,
                    keystone_run_id: run.mythic_plus_id || null,
                    is_completed_within_time: run.num_keystone_upgrades > 0,
                    score: run.score || 0,
                    num_keystone_upgrades: run.num_keystone_upgrades || 0,
                    spec_name: specData.spec_name,
                    spec_role: specData.spec_role,
                    affixes: run.affixes || [],
                    season: season
                };

                const insertResult = this.db.insertRun(characterId, runData);

                if (insertResult.inserted) {
                    results.runs_added++;
                    logger.debug('Run inserted', {
                        character: characterName,
                        dungeon: runData.dungeon,
                        level: runData.mythic_level,
                        spec: runData.spec_name,
                        specSource: specData.source
                    });
                } else {
                    results.runs_skipped++;
                }
            }

            logger.info('Collection complete for character', {
                character: characterName,
                runs_added: results.runs_added,
                runs_skipped: results.runs_skipped,
                total_recent: charData.recent_runs.length,
                accurate_specs: results.accurate_specs,
                fallback_specs: results.fallback_specs,
                spec_accuracy_rate: charData.recent_runs.length > 0
                    ? `${((results.accurate_specs / charData.recent_runs.length) * 100).toFixed(1)}%`
                    : '0%'
            });

            return results;

        } catch (error) {
            logger.error('Failed to collect runs for character', {
                character: characterName,
                error: error.message,
                stack: error.stack
            });
            return {
                character: characterName,
                runs_added: 0,
                runs_skipped: 0,
                error: error.message
            };
        }
    }

    /**
     * Collect recent runs for multiple characters
     * @param {Array<string>} characterNames - Array of character names
     * @param {Object} options - Collection options
     * @returns {Promise<Object>} Collection summary
     */
    async collectMultipleCharacters(characterNames, options = {}) {
        logger.info('Starting bulk collection', {
            characterCount: characterNames.length,
            ...options
        });

        const results = [];
        const summary = {
            total_characters: characterNames.length,
            successful: 0,
            failed: 0,
            total_runs_added: 0,
            total_runs_skipped: 0,
            started_at: new Date().toISOString()
        };

        // Process characters sequentially to avoid rate limiting
        for (const characterName of characterNames) {
            const result = await this.collectCharacterRuns(characterName, options);
            results.push(result);

            if (!result.error) {
                summary.successful++;
                summary.total_runs_added += result.runs_added;
                summary.total_runs_skipped += result.runs_skipped;
            } else {
                summary.failed++;
            }

            // Small delay to be respectful of Raider.IO API
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        summary.completed_at = new Date().toISOString();
        summary.results = results;

        logger.info('Bulk collection complete', summary);

        return summary;
    }

    /**
     * Collect best runs for multiple characters
     * @param {Array<string>} characterNames - Array of character names
     * @param {Object} options - Collection options
     * @returns {Promise<Object>} Collection summary
     */
    async collectBestRunsMultiple(characterNames, options = {}) {
        logger.info('Starting bulk best runs collection', {
            characterCount: characterNames.length,
            ...options
        });

        const results = [];
        const summary = {
            total_characters: characterNames.length,
            successful: 0,
            failed: 0,
            total_runs_added: 0,
            total_runs_skipped: 0,
            started_at: new Date().toISOString()
        };

        // Process characters sequentially to avoid rate limiting
        for (const characterName of characterNames) {
            const result = await this.collectBestRuns(characterName, options);
            results.push(result);

            if (!result.error) {
                summary.successful++;
                summary.total_runs_added += result.runs_added;
                summary.total_runs_skipped += result.runs_skipped;
            } else {
                summary.failed++;
            }

            // Small delay to be respectful of Raider.IO API
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        summary.completed_at = new Date().toISOString();
        summary.results = results;

        logger.info('Bulk best runs collection complete', summary);

        return summary;
    }

    /**
     * Collect runs from config.json characters
     * @returns {Promise<Object>} Collection summary
     */
    async collectConfigCharacters() {
        try {
            const config = require('../config.json');
            const characters = config.characters || [];

            if (characters.length === 0) {
                logger.warn('No characters found in config.json');
                return {
                    total_characters: 0,
                    successful: 0,
                    failed: 0,
                    total_runs_added: 0,
                    total_runs_skipped: 0
                };
            }

            const realm = config.realm || 'thrall';
            const region = config.region || 'us';

            return await this.collectMultipleCharacters(characters, {
                realm,
                region,
                season: CURRENT_SEASON
            });

        } catch (error) {
            logger.error('Failed to collect runs from config', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Collect best runs from config.json characters (for initial population)
     * @returns {Promise<Object>} Collection summary
     */
    async collectConfigCharactersBestRuns() {
        try {
            const config = require('../config.json');
            const characters = config.characters || [];

            if (characters.length === 0) {
                logger.warn('No characters found in config.json');
                return {
                    total_characters: 0,
                    successful: 0,
                    failed: 0,
                    total_runs_added: 0,
                    total_runs_skipped: 0
                };
            }

            const realm = config.realm || 'thrall';
            const region = config.region || 'us';

            return await this.collectBestRunsMultiple(characters, {
                realm,
                region,
                season: CURRENT_SEASON
            });

        } catch (error) {
            logger.error('Failed to collect best runs from config', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get collection statistics
     * @returns {Object} Database statistics
     */
    getStats() {
        return this.db.getStats();
    }
}

module.exports = {
    RunCollector,
    CURRENT_SEASON
};
