/**
 * Characters Command - World of Warcraft Character Progression Display
 *
 * This Discord slash command provides a comprehensive interface for viewing WoW character data
 * including Mythic+ progression, raid progression, gear information, and weekly activity.
 *
 * Features:
 * - Main character summary with M+ scores and key levels
 * - Individual character detailed views with gear information
 * - Dungeon comparison across all characters
 * - Raid progression tracking
 * - Weekly M+ activity monitoring
 * - Auto-refresh functionality with caching
 * - External links to RaiderIO and WarcraftLogs
 *
 * The command uses a modular architecture with separate utilities for:
 * - Data fetching and caching
 * - UI component creation
 * - Data formatting and display
 * - Embed generation
 */

const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const logger = require('../utils/logger');
const weeklyCsvLogger = require('../utils/weekly-csv-logger');

// Import notes system
const notesManager = require('../utils/notes-manager');
const {
    NOTES_COMPONENT_IDS,
    NOTES_MODAL_IDS,
    NOTES_INPUT_IDS,
    createNotesPageComponents,
    createSelectedNoteComponents,
    createAddNoteModal,
    createEditNoteModal,
    parseDateInput
} = require('../utils/notes-components');
const {
    createEmptyNotesEmbed,
    createNotesListEmbed,
    createNoteDetailEmbed,
    createNoteSuccessEmbed,
    createNoteErrorEmbed,
    createCleanupResultsEmbed
} = require('../utils/notes-embeds');

// Import utility modules
const { CharacterCacheManager } = require('../utils/cache-manager');
const {
    createMainMenuComponents,
    createCharacterDetailComponents,
    createDungeonComparisonComponents,
    createRaidStatsComponents,
    createWeeklyMplusComponents,
    createErrorComponents,
    extractUniqueDungeons,
    validateComponentData,
    COMPONENT_IDS
} = require('../utils/ui-components');
const { generateCharacterImage, generateWeeklyMplusImage } = require('../utils/character-image-generator');
const {
    createMainSummaryEmbed,
    createCharacterDetailEmbed,
    createDungeonComparisonEmbed,
    createRaidProgressionEmbed,
    createWeeklyMplusEmbed,
    createErrorEmbed,
    createNoDataEmbed
} = require('../utils/embed-builders');
const { findMostRelevantRaid, calculateWeeklyStats } = require('../utils/data-formatters');

// Import data services
const data = require('../helpers/get-data');
const weeklyHelper = require('../helpers/weekly');

// Custom class icons are now loaded directly in data-formatters.js

// Initialize cache manager for character data
const cacheManager = new CharacterCacheManager();

// Track active messages for auto-refresh functionality
// Map structure: messageId -> { channelId, messageId, userId, type }
// Types: 'main_menu', 'weekly_mplus'
const activeMessages = new Map();

// Auto-refresh interval reference for cleanup
let autoRefreshInterval = null;

/**
 * Fetches character data with caching support
 * @param {boolean} forceRefresh - Whether to bypass cache and fetch fresh data
 * @returns {Promise<Array>} Array of character objects with mythic plus data
 */
async function getCharacterData(forceRefresh = false) {
    try {
        // Check cache first unless forcing refresh
        if (!forceRefresh) {
            const cachedData = cacheManager.getCharacterData();
            if (cachedData) {
                logger.logCache('HIT', 'character_data');
                return cachedData;
            }
        }

        logger.debug('Fetching fresh character data from API');
        const characterData = await data.get_data();

        // Cache the fresh data
        cacheManager.setCharacterData(characterData, forceRefresh);

        logger.info('Successfully fetched character data', { characterCount: characterData.length });
        return characterData;

    } catch (error) {
        logger.error('Error fetching character data', { error: error.message, stack: error.stack });

        // Fall back to stale cache if available
        const staleData = cacheManager.getCharacterData();
        if (staleData) {
            logger.warn('Using stale cached character data due to API error');
            return staleData;
        }

        // Return empty array if no data available
        return [];
    }
}

/**
 * Fetches raid data with caching support
 * @param {boolean} forceRefresh - Whether to bypass cache and fetch fresh data
 * @returns {Promise<Array>} Array of character objects with raid progression data
 */
async function getRaidData(forceRefresh = false) {
    try {
        if (!forceRefresh) {
            const cachedData = cacheManager.getRaidData();
            if (cachedData) {
                logger.logCache('HIT', 'raid_data');
                return cachedData;
            }
        }

        logger.debug('Fetching fresh raid data from API');
        const raidData = await data.get_raid_data();

        cacheManager.setRaidData(raidData);
        logger.info('Successfully fetched raid data', { characterCount: raidData.length });
        return raidData;

    } catch (error) {
        logger.error('Error fetching raid data', { error: error.message, stack: error.stack });

        const staleData = cacheManager.getRaidData();
        if (staleData) {
            logger.warn('Using stale cached raid data due to API error');
            return staleData;
        }

        return [];
    }
}

/**
 * Fetches M+ weekly runs data with caching support
 * @param {boolean} forceRefresh - Whether to bypass cache and fetch fresh data
 * @returns {Promise<Array>} Array of character objects with recent runs data
 */
async function getMplusData(forceRefresh = false) {
    try {
        if (!forceRefresh) {
            const cachedData = cacheManager.getMplusData();
            if (cachedData) {
                logger.logCache('HIT', 'mplus_data');
                return cachedData;
            }
        }

        logger.debug('Fetching fresh M+ data from API');
        const mplusData = await data.get_mplus_data();

        cacheManager.setMplusData(mplusData);
        logger.info('Successfully fetched M+ data', { characterCount: mplusData.length });

        // Log weekly M+ data to CSV for backup and analysis
        weeklyCsvLogger.logWeeklyData(mplusData);

        return mplusData;

    } catch (error) {
        logger.error('Error fetching M+ data', { error: error.message, stack: error.stack });

        const staleData = cacheManager.getMplusData();
        if (staleData) {
            logger.warn('Using stale cached M+ data due to API error');
            return staleData;
        }

        return [];
    }
}

/**
 * Fetches gear data with caching support
 * @param {boolean} forceRefresh - Whether to bypass cache and fetch fresh data
 * @returns {Promise<Array>} Array of character objects with gear data
 */
async function getGearData(forceRefresh = false) {
    try {
        if (!forceRefresh) {
            const cachedData = cacheManager.getGearData();
            if (cachedData) {
                logger.logCache('HIT', 'gear_data');
                return cachedData;
            }
        }

        logger.debug('Fetching fresh gear data from API');
        const gearData = await data.get_gear_data();

        cacheManager.setGearData(gearData);
        logger.info('Successfully fetched gear data', { characterCount: gearData.length });
        return gearData;

    } catch (error) {
        logger.error('Error fetching gear data', { error: error.message, stack: error.stack });

        const staleData = cacheManager.getGearData();
        if (staleData) {
            logger.warn('Using stale cached gear data due to API error');
            return staleData;
        }

        return [];
    }
}

/**
 * Gets character links (synchronous operation with caching)
 * @returns {Array} Array of character link objects
 */
function getCharacterLinks() {
    try {
        // Check cache first
        const cachedLinks = cacheManager.getLinksData();
        if (cachedLinks) {
            return cachedLinks;
        }

        // Generate links and cache them
        const links = data.get_links();
        cacheManager.setLinksData(links);
        return links;

    } catch (error) {
        logger.error('Error getting character links', { error: error.message, stack: error.stack });
        return [];
    }
}

/**
 * Displays the main character summary menu
 * @param {Object} interaction - Discord interaction object
 * @param {boolean} isInitialReply - Whether this is the initial command response
 * @param {boolean} forceRefresh - Whether to force refresh of data
 */
async function showMainMenu(interaction, isInitialReply = false, forceRefresh = false) {
    try {
        // Fetch character data
        const characters = await getCharacterData(forceRefresh);

        if (characters.length === 0) {
            const errorEmbed = createErrorEmbed(
                'No character data available. Please check the configuration and try again.',
                'No Characters Found'
            );

            const messageOptions = {
                content: '',
                embeds: [errorEmbed],
                files: []
            };

            if (isInitialReply) {
                await interaction.reply(messageOptions);
            } else {
                await interaction.update(messageOptions);
            }
            return;
        }

        // Validate character data
        const validation = validateComponentData(characters);
        if (!validation.isValid) {
            logger.error('Character data validation failed', { errors: validation.errors });
            const errorEmbed = createErrorEmbed(
                'Character data is invalid. Please check logs for details.',
                'Data Validation Error'
            );

            const messageOptions = {
                content: '',
                embeds: [errorEmbed],
                files: []
            };

            if (isInitialReply) {
                await interaction.reply(messageOptions);
            } else {
                await interaction.update(messageOptions);
            }
            return;
        }

        // Create main summary embed
        const cacheInfo = cacheManager.getCacheTimestamps();
        const embed = createMainSummaryEmbed(characters, cacheInfo);

        // Extract unique dungeons for dropdown
        const uniqueDungeons = extractUniqueDungeons(characters);

        // Create UI components
        const components = createMainMenuComponents(characters, uniqueDungeons);

        const messageOptions = {
            content: '', // Clear any existing content
            embeds: [embed],
            files: [], // Clear any existing files (like character images)
            components
        };

        if (isInitialReply) {
            const response = await interaction.reply(messageOptions);

            // Store message for auto-refresh tracking
            const message = await interaction.fetchReply();
            activeMessages.set(message.id, {
                channelId: interaction.channel.id,
                messageId: message.id,
                userId: interaction.user.id,
                type: 'main_menu'
            });
            logger.debug('Stored main menu message for auto-refresh', { messageId: message.id });

        } else {
            await interaction.update(messageOptions);

            // Update auto-refresh tracking
            if (interaction.message) {
                activeMessages.set(interaction.message.id, {
                    channelId: interaction.channel.id,
                    messageId: interaction.message.id,
                    userId: interaction.user.id,
                    type: 'main_menu'
                });
            }
        }

    } catch (error) {
        logger.error('Error in showMainMenu', { error: error.message, stack: error.stack });

        const errorEmbed = createErrorEmbed(
            'Failed to load character data. Please try again later.',
            'Error Loading Data'
        );

        try {
            if (isInitialReply && !interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    embeds: [errorEmbed],
                    flags: MessageFlags.Ephemeral
                });
            } else if (!isInitialReply) {
                await interaction.update({ embeds: [errorEmbed] });
            } else {
                await interaction.editReply({ embeds: [errorEmbed] });
            }
        } catch (replyError) {
            console.error('Failed to send error message:', replyError);
        }
    }
}

/**
 * Handles character selection from dropdown menu (TEXT VERSION - PRESERVED FOR FALLBACK)
 * @param {Object} interaction - Discord select menu interaction
 * @param {Array} characters - Array of character data
 */
async function handleCharacterSelectText(interaction, characters) {
    try {
        // Remove from auto-refresh tracking
        if (interaction.message) {
            activeMessages.delete(interaction.message.id);
        }

        const selectedCharacterName = interaction.values[0];
        const selectedCharacter = characters.find(char => char.name === selectedCharacterName);

        if (!selectedCharacter) {
            const errorEmbed = createErrorEmbed(
                `Character "${selectedCharacterName}" not found.`,
                'Character Not Found'
            );
            await interaction.update({ embeds: [errorEmbed] });
            return;
        }

        // If character has no runs, show no data embed
        if (!selectedCharacter.mythic_plus_runs || selectedCharacter.mythic_plus_runs.length === 0) {
            const linksData = getCharacterLinks().find(link => link.name === selectedCharacterName);
            const noDataEmbed = createNoDataEmbed(selectedCharacterName, linksData);
            const dungeons = extractUniqueDungeons(characters);
            const components = createCharacterDetailComponents(
                false,
                characters,
                dungeons,
                'compact',
                selectedCharacterName,
                selectedCharacter.class,
                'Overall'
            );

            await interaction.update({
                embeds: [noDataEmbed],
                components
            });
            return;
        }

        // Fetch additional data for detailed view
        const [gearData, linksData] = await Promise.all([
            getGearData(),
            Promise.resolve(getCharacterLinks())
        ]);

        const characterGear = gearData.find(gear => gear.name === selectedCharacterName);
        const characterLinks = linksData.find(link => link.name === selectedCharacterName);

        // Create detailed character embed
        const detailEmbed = createCharacterDetailEmbed(
            selectedCharacter,
            characterGear,
            characterLinks
        );

        const dungeons = extractUniqueDungeons(characters);
        const components = createCharacterDetailComponents(
            true,
            characters,
            dungeons,
            'compact',
            selectedCharacterName,
            selectedCharacter.class,
            'Overall'
        );

        await interaction.update({
            embeds: [detailEmbed],
            components
        });

    } catch (error) {
        logger.error('Error in handleCharacterSelect', { error: error.message, stack: error.stack, selectedCharacterName });
        const errorEmbed = createErrorEmbed('Failed to load character details.');
        const dungeons = extractUniqueDungeons(characters);
        const components = createCharacterDetailComponents(
            false,
            characters,
            dungeons,
            'compact',
            selectedCharacterName,
            selectedCharacter?.class || null,
            'Overall'
        );

        await interaction.update({
            embeds: [errorEmbed],
            components
        });
    }
}

/**
 * Handles character selection from dropdown menu (IMAGE VERSION - NEW DEFAULT)
 * @param {Object} interaction - Discord select menu interaction
 * @param {Array} characters - Array of character data
 */
async function handleCharacterSelect(interaction, characters) {
    try {
        // Defer update since image generation can take time
        await interaction.deferUpdate();

        // Remove from auto-refresh tracking
        if (interaction.message) {
            activeMessages.delete(interaction.message.id);
        }

        const selectedCharacterName = interaction.values[0];
        const selectedCharacter = characters.find(char => char.name === selectedCharacterName);

        if (!selectedCharacter) {
            const errorEmbed = createErrorEmbed(
                `Character "${selectedCharacterName}" not found.`,
                'Character Not Found'
            );
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        logger.info('Character selected for image generation', {
            characterName: selectedCharacterName,
            user: interaction.user.tag
        });

        // Check if character has sufficient data for image generation first
        if (!selectedCharacter.mythic_plus_runs || selectedCharacter.mythic_plus_runs.length === 0) {
            // Fall back to text version for characters with no M+ data
            const linksData = getCharacterLinks().find(link => link.name === selectedCharacterName);
            const noDataEmbed = createNoDataEmbed(selectedCharacterName, linksData);
            const dungeons = extractUniqueDungeons(characters);
            const components = createCharacterDetailComponents(
                false,
                characters,
                dungeons,
                'compact',
                selectedCharacterName,
                selectedCharacter.class,
                'Overall'
            );

            await interaction.editReply({
                embeds: [noDataEmbed],
                components
            });
            return;
        }

        // Fetch only gear data for image generation (faster than fetching unused links)
        const gearData = await getGearData();
        const characterGear = gearData.find(gear => gear.name === selectedCharacterName);

        // Generate the character image with compact view as default
        const imageBuffer = await generateCharacterImage(selectedCharacter, characterGear, 'compact');

        // Create attachment for the raw image (no embed)
        const { AttachmentBuilder } = require('discord.js');
        const attachment = new AttachmentBuilder(imageBuffer, { name: `${selectedCharacterName}-sheet.png` });

        // Get the existing components (buttons) to maintain navigation with character name encoded and compact as default
        const dungeons = extractUniqueDungeons(characters);
        const components = createCharacterDetailComponents(
            true,
            characters,
            dungeons,
            'compact',
            selectedCharacterName,
            selectedCharacter.class,
            'Overall'
        );

        await interaction.editReply({
            content: '', // Clear any existing content
            embeds: [], // Explicitly clear any existing embeds
            files: [attachment],
            components
        });

        // Add to auto-refresh tracking as character image
        if (interaction.message) {
            activeMessages.set(interaction.message.id, {
                channelId: interaction.channel.id,
                messageId: interaction.message.id,
                userId: interaction.user.id,
                type: 'character_image',
                characterName: selectedCharacterName,
                viewMode: 'compact',
                selectedSpec: 'Overall'
            });
        }

        logger.info('Character image generated successfully', {
            user: interaction.user.tag,
            characterName: selectedCharacterName,
            hasGearData: !!characterGear,
            runsCount: selectedCharacter.mythic_plus_runs?.length || 0
        });

    } catch (error) {
        logger.error('Error in handleCharacterSelect (image)', {
            error: error.message,
            stack: error.stack,
            characterName: interaction.values?.[0] || 'unknown'
        });

        // Fall back to text version on error
        try {
            logger.info('Falling back to text version due to image generation error');

            // Since interaction is already deferred, we need to handle differently
            if (interaction.deferred) {
                // We need to manually recreate the text logic here since the text function expects a fresh interaction
                const selectedCharacterName = interaction.values[0];
                const selectedCharacter = characters.find(char => char.name === selectedCharacterName);

                if (selectedCharacter) {
                    const [gearData, linksData] = await Promise.all([
                        getGearData(),
                        Promise.resolve(getCharacterLinks())
                    ]);

                    const characterGear = gearData.find(gear => gear.name === selectedCharacterName);
                    const characterLinks = linksData.find(link => link.name === selectedCharacterName);

                    const detailEmbed = createCharacterDetailEmbed(
                        selectedCharacter,
                        characterGear,
                        characterLinks
                    );

                    const dungeons = extractUniqueDungeons(characters);
                    const components = createCharacterDetailComponents(
                        true,
                        characters,
                        dungeons,
                        'compact',
                        selectedCharacterName,
                        selectedCharacter.class,
                        'Overall'
                    );

                    await interaction.editReply({
                        embeds: [detailEmbed],
                        components,
                        files: [] // Clear any files
                    });
                    return;
                }
            }
        } catch (fallbackError) {
            logger.error('Fallback to text version also failed', { error: fallbackError.message });

            const errorEmbed = createErrorEmbed('Failed to load character details.');
            const dungeons = extractUniqueDungeons(characters);
            const selectedCharacterName = interaction.values?.[0];
            const selectedCharacter = characters.find(char => char.name === selectedCharacterName);
            const components = createCharacterDetailComponents(
                false,
                characters,
                dungeons,
                'compact',
                selectedCharacterName,
                selectedCharacter?.class || null,
                'Overall'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed], components });
            } else {
                await interaction.update({ embeds: [errorEmbed], components });
            }
        }
    }
}

/**
 * Handles dungeon selection from dropdown menu
 * @param {Object} interaction - Discord select menu interaction
 * @param {Array} characters - Array of character data
 */
async function handleDungeonSelect(interaction, characters) {
    try {
        // Remove from auto-refresh tracking
        if (interaction.message) {
            activeMessages.delete(interaction.message.id);
        }

        const selectedDungeon = interaction.values[0];

        // Create dungeon comparison embed
        const dungeonEmbed = createDungeonComparisonEmbed(selectedDungeon, characters);
        const components = createDungeonComparisonComponents(true);

        await interaction.update({
            embeds: [dungeonEmbed],
            components
        });

    } catch (error) {
        logger.error('Error in handleDungeonSelect', { error: error.message, stack: error.stack });
        const errorEmbed = createErrorEmbed('Failed to load dungeon comparison.');
        const components = createDungeonComparisonComponents(false);

        await interaction.update({
            embeds: [errorEmbed],
            components
        });
    }
}

/**
 * Handles spec selection from dropdown menu
 * @param {Object} interaction - Discord select menu interaction
 * @param {Array} characters - Array of character data
 */
async function handleSpecSelect(interaction, characters) {
    try {
        // Defer update since image generation and API calls can take time
        await interaction.deferUpdate();

        const selectedSpec = interaction.values[0];

        // Get character name from active message tracking
        const messageInfo = activeMessages.get(interaction.message?.id);
        if (!messageInfo || !messageInfo.characterName) {
            logger.error('No character name found in active message tracking for spec selection');
            const errorEmbed = createErrorEmbed('Unable to determine which character to filter.');
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        const characterName = messageInfo.characterName;
        const selectedCharacter = characters.find(char => char.name === characterName);

        if (!selectedCharacter) {
            const errorEmbed = createErrorEmbed(`Character "${characterName}" not found.`);
            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        logger.info('Spec selected for filtering', {
            characterName,
            spec: selectedSpec,
            user: interaction.user.tag
        });

        // Fetch gear data for image generation
        const gearData = await getGearData();
        const characterGear = gearData.find(gear => gear.name === characterName);

        let filteredCharacter = selectedCharacter;

        // If not "Overall", filter runs by spec using Combined API
        if (selectedSpec !== 'Overall') {
            const { CombinedWowClient } = require('../services/combined-wow-client');
            const { filterRunsBySpec } = require('../utils/spec-filter');
            const client = new CombinedWowClient();

            logger.info('Fetching spec-specific runs', {
                characterName,
                spec: selectedSpec,
                blizzardConfigured: client.blizzard.isConfigured()
            });

            // Fetch spec-specific runs from Blizzard API
            const specRuns = await client.getSpecificRuns(characterName, selectedSpec);

            logger.info('Spec runs fetched', {
                characterName,
                spec: selectedSpec,
                runsReturned: specRuns?.length || 0,
                sampleRun: specRuns?.[0] || null
            });

            if (specRuns && specRuns.length > 0) {
                // Convert Blizzard API format to match RaiderIO format
                filteredCharacter = {
                    ...selectedCharacter,
                    mythic_plus_runs: specRuns.map(run => ({
                        dungeon: run.dungeon,
                        mythic_level: run.mythic_level,
                        score: run.map_rating || run.mythic_rating || 0,
                        timed: run.is_completed_within_time ? 1 : 0
                    }))
                };

                logger.info('Filtered runs by spec', {
                    characterName,
                    spec: selectedSpec,
                    originalRuns: selectedCharacter.mythic_plus_runs?.length || 0,
                    filteredRuns: filteredCharacter.mythic_plus_runs.length
                });
            } else {
                // No runs found for this spec
                filteredCharacter = {
                    ...selectedCharacter,
                    mythic_plus_runs: []
                };

                logger.warn('No runs found for spec', {
                    characterName,
                    spec: selectedSpec,
                    specRunsIsNull: specRuns === null,
                    specRunsIsUndefined: specRuns === undefined,
                    specRunsLength: specRuns?.length
                });
            }
        }

        // Generate character image with filtered data
        const viewMode = messageInfo.viewMode || 'compact';
        const imageBuffer = await generateCharacterImage(filteredCharacter, characterGear, viewMode);

        // Create attachment
        const { AttachmentBuilder } = require('discord.js');
        const attachment = new AttachmentBuilder(imageBuffer, {
            name: `${characterName}-${selectedSpec}-sheet.png`
        });

        // Update components with selected spec
        const dungeons = extractUniqueDungeons(characters);
        const components = createCharacterDetailComponents(
            true,
            characters,
            dungeons,
            viewMode,
            characterName,
            selectedCharacter.class,
            selectedSpec
        );

        await interaction.editReply({
            content: '',
            embeds: [],
            files: [attachment],
            components
        });

        // Update active message tracking with current spec
        if (interaction.message) {
            activeMessages.set(interaction.message.id, {
                ...messageInfo,
                selectedSpec
            });
        }

        logger.info('Character image regenerated with spec filter', {
            characterName,
            spec: selectedSpec,
            viewMode
        });

    } catch (error) {
        logger.error('Error in handleSpecSelect', {
            error: error.message,
            stack: error.stack,
            spec: interaction.values?.[0]
        });

        const errorEmbed = createErrorEmbed('Failed to filter by spec. Please try again.');
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Handles view mode button interactions for character images
 * @param {Object} interaction - Discord button interaction
 * @param {string} viewMode - The selected view mode ('detailed', 'compact', 'comparison')
 */
async function handleViewModeChange(interaction, viewMode) {
    try {
        // Defer update since image generation can take time
        await interaction.deferUpdate();

        // Get current message info before removing from tracking
        const messageInfo = activeMessages.get(interaction.message?.id);
        const currentSpec = messageInfo?.selectedSpec || 'Overall';

        // Remove from auto-refresh tracking
        if (interaction.message) {
            activeMessages.delete(interaction.message.id);
        }

        // Get current character data
        const characters = await getCharacterData(false);

        // Extract character name from custom ID (format: "char_view_mode_CharacterName")
        let selectedCharacterName = null;
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length >= 4) {
            // Custom ID format: char_view_mode_CharacterName
            selectedCharacterName = customIdParts.slice(3).join('_'); // Handle names with underscores
        }

        if (!selectedCharacterName) {
            // Fallback: show error if we can't determine the character
            const errorEmbed = createErrorEmbed('Could not determine which character to display.');
            const components = createErrorComponents(true);
            await interaction.editReply({ embeds: [errorEmbed], components });
            return;
        }

        // Find the character data
        const selectedCharacter = characters.find(char =>
            char.name.toLowerCase() === selectedCharacterName.toLowerCase()
        );

        if (!selectedCharacter) {
            // Character not found, show error
            const errorEmbed = createErrorEmbed(`Character "${selectedCharacterName}" not found.`);
            const components = createErrorComponents(true);
            await interaction.editReply({ embeds: [errorEmbed], components });
            return;
        }

        // Generate character image with the new view mode
        logger.info('Generating character image with view mode', {
            characterName: selectedCharacter.name,
            viewMode,
            currentSpec,
            user: interaction.user.tag
        });

        // Get gear data for the character
        const gearData = await getGearData();
        const characterGear = gearData.find(gear => gear.name === selectedCharacter.name);

        let filteredCharacter = selectedCharacter;

        // Apply spec filter if not "Overall"
        if (currentSpec !== 'Overall') {
            const { CombinedWowClient } = require('../services/combined-wow-client');
            const client = new CombinedWowClient();

            const specRuns = await client.getSpecificRuns(selectedCharacterName, currentSpec);

            if (specRuns && specRuns.length > 0) {
                filteredCharacter = {
                    ...selectedCharacter,
                    mythic_plus_runs: specRuns.map(run => ({
                        dungeon: run.dungeon,
                        mythic_level: run.mythic_level,
                        score: run.map_rating || run.mythic_rating || 0,
                        timed: run.is_completed_within_time ? 1 : 0
                    }))
                };
            } else {
                filteredCharacter = {
                    ...selectedCharacter,
                    mythic_plus_runs: []
                };
            }
        }

        // Generate the character image with the specified view mode
        const { generateCharacterImage } = require('../utils/character-image-generator');
        const imageBuffer = await generateCharacterImage(filteredCharacter, characterGear, viewMode);

        // Create attachment and send
        const attachment = new AttachmentBuilder(imageBuffer, {
            name: `${selectedCharacter.name.toLowerCase()}-${viewMode}.png`
        });

        // Get updated components with the new view mode highlighted and character name encoded
        const dungeons = extractUniqueDungeons([selectedCharacter]);
        const components = createCharacterDetailComponents(
            true,
            characters,
            dungeons,
            viewMode,
            selectedCharacter.name,
            selectedCharacter.class,
            currentSpec
        );

        await interaction.editReply({
            content: '',
            embeds: [],
            files: [attachment],
            components
        });

        // Re-add to auto-refresh tracking with updated view mode
        if (interaction.message) {
            activeMessages.set(interaction.message.id, {
                channelId: interaction.channel.id,
                messageId: interaction.message.id,
                userId: interaction.user.id,
                type: 'character_image',
                characterName: selectedCharacter.name,
                viewMode: viewMode,
                selectedSpec: currentSpec
            });
        }

        logger.info('Character image generated successfully with view mode', {
            user: interaction.user.tag,
            characterName: selectedCharacter.name,
            viewMode,
            currentSpec,
            hasGearData: !!characterGear,
            runsCount: filteredCharacter.mythic_plus_runs?.length || 0
        });

    } catch (error) {
        logger.error('Error in handleViewModeChange', {
            error: error.message,
            stack: error.stack,
            viewMode
        });

        const errorEmbed = createErrorEmbed('Failed to change view mode.');
        const components = createErrorComponents(true);

        await interaction.editReply({
            embeds: [errorEmbed],
            components
        });
    }
}

/**
 * Handles raid progression menu display
 * @param {Object} interaction - Discord button interaction
 */
async function handleRaidMenu(interaction) {
    try {
        // Remove from auto-refresh tracking
        if (interaction.message) {
            activeMessages.delete(interaction.message.id);
        }

        const raidData = await getRaidData();
        const raidEmbed = createRaidProgressionEmbed(raidData);
        const components = createRaidStatsComponents();

        await interaction.update({
            embeds: [raidEmbed],
            components
        });

    } catch (error) {
        logger.error('Error in handleRaidMenu', { error: error.message, stack: error.stack });
        const errorEmbed = createErrorEmbed('Failed to load raid progression data.');
        const components = createRaidStatsComponents();

        await interaction.update({
            embeds: [errorEmbed],
            components
        });
    }
}

/**
 * Handles weekly M+ runs menu display with image generation
 * @param {Object} interaction - Discord button interaction
 */
async function handleWeeklyRunsMenu(interaction) {
    try {
        const [mplusData, characters] = await Promise.all([
            getMplusData(),
            getCharacterData(false)
        ]);
        const lastReset = weeklyHelper.getLastTuesdayReset();
        const dungeons = extractUniqueDungeons(characters);
        const components = createWeeklyMplusComponents(characters, dungeons);

        try {
            // Try to generate weekly M+ image
            logger.info('Generating weekly M+ image for display');
            const imageBuffer = await generateWeeklyMplusImage(mplusData, lastReset);
            const attachment = new AttachmentBuilder(imageBuffer, {
                name: 'weekly-mplus.png',
                description: 'Weekly M+ Runs Summary'
            });

            await interaction.update({
                content: null,
                embeds: [],
                files: [attachment],
                components
            });

            logger.info('Weekly M+ image display successful');

        } catch (imageError) {
            logger.warn('Failed to generate weekly M+ image, falling back to embed', {
                error: imageError.message
            });

            // Fallback to embed display
            const weeklyEmbed = createWeeklyMplusEmbed(mplusData, lastReset);
            await interaction.update({
                embeds: [weeklyEmbed],
                files: [],
                components
            });
        }

        // Add to auto-refresh tracking as weekly M+ page
        if (interaction.message) {
            activeMessages.set(interaction.message.id, {
                channelId: interaction.channel.id,
                messageId: interaction.message.id,
                userId: interaction.user.id,
                type: 'weekly_mplus'
            });
            logger.debug('Stored weekly M+ message for auto-refresh', { messageId: interaction.message.id });
        }

    } catch (error) {
        logger.error('Error in handleWeeklyRunsMenu', { error: error.message, stack: error.stack });
        const errorEmbed = createErrorEmbed('Failed to load weekly M+ data.');

        try {
            const characters = await getCharacterData(false);
            const dungeons = extractUniqueDungeons(characters);
            const components = createWeeklyMplusComponents(characters, dungeons);

            await interaction.update({
                embeds: [errorEmbed],
                files: [],
                components
            });
        } catch (fallbackError) {
            // If we can't get character data, show minimal components
            const components = createWeeklyMplusComponents();
            await interaction.update({
                embeds: [errorEmbed],
                files: [],
                components
            });
        }
    }
}

/**
 * Handles character links menu display
 * @param {Object} interaction - Discord button interaction
 */
async function handleLinksMenu(interaction) {
    try {
        const linksData = getCharacterLinks();

        // Create a simple links embed
        const embed = createErrorEmbed(
            linksData.map(link =>
                `**${link.name}**\n[RaiderIO](${link.raiderIoLink}) | [WarcraftLogs](${link.warcraftlogsLink})`
            ).join('\n\n'),
            'Character Links'
        );

        const components = createRaidStatsComponents(); // Reuse for back button

        await interaction.update({
            embeds: [embed],
            components
        });

    } catch (error) {
        logger.error('Error in handleLinksMenu', { error: error.message, stack: error.stack });
        const errorEmbed = createErrorEmbed('Failed to load character links.');
        await interaction.update({ embeds: [errorEmbed] });
    }
}

/**
 * Handles notes page display and interactions
 * @param {Object} interaction - Discord interaction
 */
async function handleNotesPage(interaction, filter = 'all') {
    try {
        const guildId = interaction.guildId;
        const guildName = interaction.guild?.name || 'this server';

        // Get notes based on filter
        let notes;
        switch (filter) {
            case 'pending':
                notes = notesManager.getFilteredNotes(guildId, false);
                break;
            case 'completed':
                notes = notesManager.getFilteredNotes(guildId, true);
                break;
            case 'overdue':
                notes = notesManager.getOverdueNotes(guildId);
                break;
            default:
                notes = notesManager.getGuildNotes(guildId);
        }

        // Get statistics
        const stats = notesManager.getNotesStats(guildId);

        // Create embed
        let embed;
        if (notes.length === 0 && filter === 'all') {
            embed = createEmptyNotesEmbed(guildName);
        } else {
            embed = createNotesListEmbed(notes, stats, filter, guildName);
        }

        // Create components
        const components = createNotesPageComponents(notes, filter);

        await interaction.update({
            embeds: [embed],
            components
        });

        logger.info('Notes page displayed', {
            guildId,
            filter,
            noteCount: notes.length,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error in handleNotesPage', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('display notes', error.message);
        await interaction.update({ embeds: [errorEmbed] });
    }
}

/**
 * Handles individual note selection for detailed view/management
 * @param {Object} interaction - Discord select menu interaction
 */
async function handleNoteSelection(interaction) {
    try {
        const guildId = interaction.guildId;
        const noteId = interaction.values[0];

        if (noteId === 'no_notes') {
            return;
        }

        const notes = notesManager.getGuildNotes(guildId);
        const selectedNote = notes.find(note => note.id === noteId);

        if (!selectedNote) {
            const errorEmbed = createNoteErrorEmbed('find note', 'The selected note could not be found.');
            await interaction.update({ embeds: [errorEmbed] });
            return;
        }

        const embed = createNoteDetailEmbed(selectedNote, interaction.guild?.name);
        const components = createSelectedNoteComponents(selectedNote);

        await interaction.update({
            embeds: [embed],
            components
        });

        logger.info('Note selected for detailed view', {
            guildId,
            noteId,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error in handleNoteSelection', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('select note', error.message);
        await interaction.update({ embeds: [errorEmbed] });
    }
}

/**
 * Handles add note button - shows the add note modal
 * @param {Object} interaction - Discord button interaction
 */
async function handleAddNote(interaction) {
    try {
        const modal = createAddNoteModal();
        await interaction.showModal(modal);

        logger.info('Add note modal shown', {
            guildId: interaction.guildId,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error in handleAddNote', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('show add note form', error.message);
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}

/**
 * Handles edit note button - shows the edit note modal for selected note
 * @param {Object} interaction - Discord button interaction
 */
async function handleEditNote(interaction) {
    try {
        // Extract note ID from custom ID
        const noteId = interaction.customId.replace(`${NOTES_COMPONENT_IDS.EDIT_NOTE}_`, '');

        if (!noteId || noteId === NOTES_COMPONENT_IDS.EDIT_NOTE) {
            const errorEmbed = createNoteErrorEmbed('edit note', 'Please select a note first using the dropdown menu.');
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        const guildId = interaction.guildId;
        const notes = notesManager.getGuildNotes(guildId);
        const note = notes.find(n => n.id === noteId);

        if (!note) {
            const errorEmbed = createNoteErrorEmbed('edit note', 'The selected note could not be found.');
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        const modal = createEditNoteModal(note);
        await interaction.showModal(modal);

        logger.info('Edit note modal shown', {
            guildId,
            noteId,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error in handleEditNote', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('edit note', error.message);
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}

/**
 * Handles delete note button
 * @param {Object} interaction - Discord button interaction
 */
async function handleDeleteNote(interaction) {
    try {
        // Extract note ID from custom ID
        const noteId = interaction.customId.replace(`${NOTES_COMPONENT_IDS.DELETE_NOTE}_`, '');

        if (!noteId || noteId === NOTES_COMPONENT_IDS.DELETE_NOTE) {
            const errorEmbed = createNoteErrorEmbed('delete note', 'Please select a note first using the dropdown menu.');
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        const guildId = interaction.guildId;
        const deleted = notesManager.deleteNote(guildId, noteId);

        if (!deleted) {
            const errorEmbed = createNoteErrorEmbed('delete note', 'The selected note could not be found or deleted.');
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Return to main notes page after deletion
        await handleNotesPage(interaction);

        logger.info('Note deleted successfully', {
            guildId,
            noteId,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error in handleDeleteNote', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('delete note', error.message);
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}

/**
 * Handles complete note button
 * @param {Object} interaction - Discord button interaction
 */
async function handleCompleteNote(interaction) {
    try {
        // Extract note ID from custom ID
        const noteId = interaction.customId.replace(`${NOTES_COMPONENT_IDS.COMPLETE_NOTE}_`, '');

        if (!noteId || noteId === NOTES_COMPONENT_IDS.COMPLETE_NOTE) {
            const errorEmbed = createNoteErrorEmbed('complete note', 'Please select a note first using the dropdown menu.');
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const completedNote = notesManager.completeNote(guildId, noteId, userId);

        if (!completedNote) {
            const errorEmbed = createNoteErrorEmbed('complete note', 'The selected note could not be found or completed.');
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Update the embed to show the completed note
        const embed = createNoteDetailEmbed(completedNote, interaction.guild?.name);
        const components = createSelectedNoteComponents(completedNote);

        await interaction.update({
            embeds: [embed],
            components
        });

        logger.info('Note completed successfully', {
            guildId,
            noteId,
            userId
        });

    } catch (error) {
        logger.error('Error in handleCompleteNote', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('complete note', error.message);
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}

/**
 * Handles uncomplete note button
 * @param {Object} interaction - Discord button interaction
 */
async function handleUncompleteNote(interaction) {
    try {
        // Extract note ID from custom ID
        const noteId = interaction.customId.replace(`${NOTES_COMPONENT_IDS.UNCOMPLETE_NOTE}_`, '');

        if (!noteId || noteId === NOTES_COMPONENT_IDS.UNCOMPLETE_NOTE) {
            const errorEmbed = createNoteErrorEmbed('uncomplete note', 'Please select a note first using the dropdown menu.');
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        const guildId = interaction.guildId;
        const uncompletedNote = notesManager.uncompleteNote(guildId, noteId);

        if (!uncompletedNote) {
            const errorEmbed = createNoteErrorEmbed('uncomplete note', 'The selected note could not be found or uncompleted.');
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Update the embed to show the uncompleted note
        const embed = createNoteDetailEmbed(uncompletedNote, interaction.guild?.name);
        const components = createSelectedNoteComponents(uncompletedNote);

        await interaction.update({
            embeds: [embed],
            components
        });

        logger.info('Note uncompleted successfully', {
            guildId,
            noteId,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error in handleUncompleteNote', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('uncomplete note', error.message);
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}

/**
 * Handles notes filter dropdown selection
 * @param {Object} interaction - Discord select menu interaction
 */
async function handleNotesFilter(interaction) {
    try {
        const filter = interaction.values[0];
        await handleNotesPage(interaction, filter);

        logger.info('Notes filter applied', {
            guildId: interaction.guildId,
            filter,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error in handleNotesFilter', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('filter notes', error.message);
        await interaction.update({ embeds: [errorEmbed] });
    }
}

/**
 * Handles notes cleanup button
 * @param {Object} interaction - Discord button interaction
 */
async function handleNotesCleanup(interaction) {
    try {
        const guildId = interaction.guildId;
        const cleanedCount = notesManager.cleanupOldNotes(guildId, 30);

        const embed = createCleanupResultsEmbed(cleanedCount, 30);
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        logger.info('Notes cleanup completed', {
            guildId,
            cleanedCount,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error in handleNotesCleanup', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('cleanup notes', error.message);
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}

/**
 * Handles add note modal submission
 * @param {Object} interaction - Discord modal submit interaction
 */
async function handleAddNoteSubmission(interaction) {
    try {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        // Extract form data
        const content = interaction.fields.getTextInputValue(NOTES_INPUT_IDS.CONTENT);
        const dueDateInput = interaction.fields.getTextInputValue(NOTES_INPUT_IDS.DUE_DATE);

        // Parse due date if provided
        let dueDate = null;
        if (dueDateInput && dueDateInput.trim()) {
            dueDate = parseDateInput(dueDateInput.trim());
            if (!dueDate) {
                const errorEmbed = createNoteErrorEmbed('add note', 'Invalid due date format. Please use YYYY-MM-DD or MM/DD/YYYY format.');
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }
        }

        // Defer reply to acknowledge the modal submission
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Add the note
        const note = notesManager.addNote(guildId, content, userId, dueDate);

        // Update the original message to show the new note in detail view
        const embed = createNoteDetailEmbed(note, interaction.guild?.name);
        const components = createSelectedNoteComponents(note);

        await interaction.message.edit({
            embeds: [embed],
            components
        });

        // Delete the deferred reply to keep interface clean
        await interaction.deleteReply();

        logger.info('Note added successfully', {
            guildId,
            noteId: note.id,
            userId,
            hasDueDate: !!dueDate
        });

    } catch (error) {
        logger.error('Error in handleAddNoteSubmission', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('add note', error.message);
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}

/**
 * Handles edit note modal submission
 * @param {Object} interaction - Discord modal submit interaction
 */
async function handleEditNoteSubmission(interaction) {
    try {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        // Extract note ID from modal custom ID
        const noteId = interaction.customId.replace(`${NOTES_MODAL_IDS.EDIT_NOTE}_`, '');

        // Extract form data
        const content = interaction.fields.getTextInputValue(NOTES_INPUT_IDS.CONTENT);
        const dueDateInput = interaction.fields.getTextInputValue(NOTES_INPUT_IDS.DUE_DATE);

        // Parse due date if provided
        let dueDate = null;
        if (dueDateInput && dueDateInput.trim()) {
            dueDate = parseDateInput(dueDateInput.trim());
            if (!dueDate) {
                const errorEmbed = createNoteErrorEmbed('edit note', 'Invalid due date format. Please use YYYY-MM-DD or MM/DD/YYYY format.');
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }
        }

        // Update the note
        const updatedNote = notesManager.updateNote(guildId, noteId, {
            content,
            dueDate
        });

        if (!updatedNote) {
            const errorEmbed = createNoteErrorEmbed('edit note', 'Note not found or could not be updated.');
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Defer reply to acknowledge the modal submission
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Update the original message to show the updated note
        const embed = createNoteDetailEmbed(updatedNote, interaction.guild?.name);
        const components = createSelectedNoteComponents(updatedNote);

        await interaction.message.edit({
            embeds: [embed],
            components
        });

        // Delete the deferred reply to keep interface clean
        await interaction.deleteReply();

        logger.info('Note updated successfully', {
            guildId,
            noteId,
            userId
        });

    } catch (error) {
        logger.error('Error in handleEditNoteSubmission', { error: error.message, stack: error.stack });
        const errorEmbed = createNoteErrorEmbed('edit note', error.message);
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}

/**
 * Handles character image WIP button - generates and sends character image
 * @param {Object} interaction - Discord button interaction
 */
async function handleCharacterImageWIP(interaction) {
    try {
        // Defer the update since image generation can take time
        await interaction.deferUpdate();

        logger.info('Character image WIP requested', {
            user: interaction.user.tag,
            guildId: interaction.guildId
        });

        // We need to determine which character to generate an image for
        // This is tricky since we're coming from a button click without context
        // For now, let's show a simple message explaining the limitation

        // In a full implementation, we would need to:
        // 1. Store the current character context in the button's custom ID
        // 2. Or require the user to select a character first
        // 3. Or generate an image for all characters

        // For this WIP version, let's create a simple test image
        const testCharacterData = {
            name: 'Test Character',
            class: 'Death Knight',
            level: 80,
            mythic_plus_runs: [
                {
                    dungeon: 'The Dawnbreaker',
                    mythic_level: 17,
                    timed: true,
                    score: 441.2
                },
                {
                    dungeon: 'Priory of the Sacred Flame',
                    mythic_level: 13,
                    timed: false,
                    score: 318.5
                }
            ],
            mythic_plus_scores_by_season: [{
                scores: { all: 2845.5 }
            }]
        };

        const testGearData = {
            item_level: 626,
            thumbnail_url: 'https://render.worldofwarcraft.com/us/character/thrall/daemourne/avatar/3.jpg',
            items: {
                head: { name: 'Crown of the Forgotten', item_level: 639, item_quality: 4 },
                chest: { name: 'Breastplate of the Eternal', item_level: 636, item_quality: 4 },
                legs: { name: 'Legguards of Dark Intent', item_level: 636, item_quality: 4 },
                feet: { name: 'Boots of Unending Steps', item_level: 629, item_quality: 4 }
            }
        };

        // Generate the character image
        const imageBuffer = await generateCharacterImage(testCharacterData, testGearData);

        // Create attachment for the embed image
        const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'character-sheet.png' });

        // Create an embed that uses the generated image
        const imageEmbed = new EmbedBuilder()
            .setTitle(`${testCharacterData.name} - Character Sheet (WIP)`)
            .setDescription('Generated character image showing gear and M+ progression')
            .setImage('attachment://character-sheet.png')
            .setColor(0x00FF00)
            .setTimestamp();

        // Get the existing components (buttons) to maintain navigation
        const characters = await getCharacterData(false);
        const dungeons = extractUniqueDungeons(characters);
        const components = createCharacterDetailComponents(
            true,
            characters,
            dungeons,
            'compact',
            testCharacterData.name,
            testCharacterData.class,
            'Overall'
        );

        await interaction.editReply({
            embeds: [imageEmbed],
            files: [attachment],
            components
        });

        logger.info('Character image generated successfully', {
            user: interaction.user.tag,
            characterName: testCharacterData.name
        });

    } catch (error) {
        logger.error('Error generating character image', {
            error: error.message,
            stack: error.stack,
            user: interaction.user.tag
        });

        try {
            const errorMessage = 'Failed to generate character image. This is a WIP feature - please try again later.';

            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage, embeds: [], files: [], components: [] });
            } else {
                await interaction.update({ content: errorMessage, embeds: [], files: [], components: [] });
            }
        } catch (replyError) {
            logger.error('Failed to send error response for character image', { error: replyError.message });
        }
    }
}

/**
 * Auto-refreshes all active messages (main menus and weekly M+ pages)
 * @param {Object} client - Discord client instance
 */
async function autoRefreshAllMessages(client) {
    logger.info('Starting auto-refresh for active messages', { activeMessageCount: activeMessages.size });

    // Force refresh character data and M+ data (which triggers CSV logging)
    await getCharacterData(true);
    await getMplusData(true); // This will trigger CSV logging via weeklyCsvLogger.logWeeklyData()

    const updatePromises = [];

    // Update all tracked messages based on their type
    for (const [messageId, messageInfo] of activeMessages) {
        let updatePromise;

        if (messageInfo.type === 'main_menu') {
            updatePromise = updateMainMenuMessage(client, messageId, messageInfo);
        } else if (messageInfo.type === 'weekly_mplus') {
            updatePromise = updateWeeklyMplusMessage(client, messageId, messageInfo);
        } else if (messageInfo.type === 'character_image') {
            updatePromise = updateCharacterImageMessage(client, messageId, messageInfo);
        } else {
            logger.warn('Unknown message type for auto-refresh', { messageId, type: messageInfo.type });
            continue;
        }

        updatePromises.push(updatePromise);
    }

    const results = await Promise.allSettled(updatePromises);

    let successCount = 0;
    let failCount = 0;

    results.forEach((result, index) => {
        const messageId = Array.from(activeMessages.keys())[index];
        if (result.status === 'fulfilled') {
            successCount++;
            logger.debug('Successfully updated message', { messageId });
        } else {
            failCount++;
            logger.warn('Failed to update message', { messageId, reason: result.reason?.message || result.reason });
            // Remove failed messages from tracking
            activeMessages.delete(messageId);
        }
    });

    logger.info('Auto-refresh completed', {
        successCount,
        failCount,
        csvLogged: true,
        note: 'M+ data automatically saved to CSV during refresh'
    });
}

/**
 * Updates a specific main menu message during auto-refresh
 * @param {Object} client - Discord client instance
 * @param {string} messageId - Message ID to update
 * @param {Object} menuInfo - Menu tracking information
 */
async function updateMainMenuMessage(client, messageId, menuInfo) {
    try {
        const channel = await client.channels.fetch(menuInfo.channelId);
        if (!channel) {
            throw new Error(`Channel ${menuInfo.channelId} not found`);
        }

        const message = await channel.messages.fetch(messageId);
        if (!message) {
            throw new Error(`Message ${messageId} not found`);
        }

        // Get fresh character data (should be cached from autoRefreshAllMessages)
        const characters = await getCharacterData(false);

        // Create updated embed
        const cacheInfo = cacheManager.getCacheTimestamps();
        const embed = createMainSummaryEmbed(characters, cacheInfo);

        // Update message with new embed, keep existing components
        await message.edit({
            embeds: [embed],
            components: message.components
        });

    } catch (error) {
        logger.error('Failed to update main menu', { messageId, error: error.message, stack: error.stack });
        throw error;
    }
}

/**
 * Updates a specific weekly M+ message during auto-refresh with image generation
 * @param {Object} client - Discord client instance
 * @param {string} messageId - Message ID to update
 * @param {Object} messageInfo - Message tracking information
 */
async function updateWeeklyMplusMessage(client, messageId, messageInfo) {
    try {
        const channel = await client.channels.fetch(messageInfo.channelId);
        if (!channel) {
            throw new Error(`Channel ${messageInfo.channelId} not found`);
        }

        const message = await channel.messages.fetch(messageId);
        if (!message) {
            throw new Error(`Message ${messageId} not found`);
        }

        // Get fresh M+ data and character data (should be cached from autoRefreshAllMessages)
        const [mplusData, characters] = await Promise.all([
            getMplusData(false),
            getCharacterData(false)
        ]);
        const lastReset = weeklyHelper.getLastTuesdayReset();
        const dungeons = extractUniqueDungeons(characters);
        const components = createWeeklyMplusComponents(characters, dungeons);

        try {
            // Try to generate updated weekly M+ image
            const imageBuffer = await generateWeeklyMplusImage(mplusData, lastReset);
            const attachment = new AttachmentBuilder(imageBuffer, {
                name: 'weekly-mplus.png',
                description: 'Weekly M+ Runs Summary'
            });

            // Update message with new image and components
            await message.edit({
                content: null,
                embeds: [],
                files: [attachment],
                components
            });

        } catch (imageError) {
            logger.warn('Failed to generate weekly M+ image during auto-refresh, falling back to embed', {
                error: imageError.message,
                messageId
            });

            // Fallback to embed display
            const embed = createWeeklyMplusEmbed(mplusData, lastReset);
            await message.edit({
                embeds: [embed],
                files: [],
                components
            });
        }

    } catch (error) {
        logger.error('Failed to update weekly M+ message', { messageId, error: error.message, stack: error.stack });
        throw error;
    }
}

/**
 * Updates a specific character image message during auto-refresh
 * @param {Object} client - Discord client instance
 * @param {string} messageId - Message ID to update
 * @param {Object} messageInfo - Message tracking information
 */
async function updateCharacterImageMessage(client, messageId, messageInfo) {
    try {
        const channel = await client.channels.fetch(messageInfo.channelId);
        if (!channel) {
            throw new Error(`Channel ${messageInfo.channelId} not found`);
        }

        const message = await channel.messages.fetch(messageId);
        if (!message) {
            throw new Error(`Message ${messageId} not found`);
        }

        // Get fresh character data and gear data
        const [characters, gearData] = await Promise.all([
            getCharacterData(false),
            getGearData(false)
        ]);

        // Find the specific character
        const selectedCharacter = characters.find(char => char.name === messageInfo.characterName);
        if (!selectedCharacter) {
            throw new Error(`Character ${messageInfo.characterName} not found in data`);
        }

        // Find the character's gear data
        const characterGear = gearData.find(gear => gear.name === messageInfo.characterName);

        // Get view mode and spec from message info
        const viewMode = messageInfo.viewMode || 'compact';
        const selectedSpec = messageInfo.selectedSpec || 'Overall';

        let filteredCharacter = selectedCharacter;

        // Apply spec filter if not "Overall"
        if (selectedSpec !== 'Overall') {
            const { CombinedWowClient } = require('../services/combined-wow-client');
            const client = new CombinedWowClient();

            const specRuns = await client.getSpecificRuns(messageInfo.characterName, selectedSpec);

            if (specRuns && specRuns.length > 0) {
                filteredCharacter = {
                    ...selectedCharacter,
                    mythic_plus_runs: specRuns.map(run => ({
                        dungeon: run.dungeon,
                        mythic_level: run.mythic_level,
                        score: run.map_rating || run.mythic_rating || 0,
                        timed: run.is_completed_within_time ? 1 : 0
                    }))
                };
            } else {
                filteredCharacter = {
                    ...selectedCharacter,
                    mythic_plus_runs: []
                };
            }
        }

        // Generate updated character image with stored view mode
        const imageBuffer = await generateCharacterImage(filteredCharacter, characterGear, viewMode);
        const attachment = new AttachmentBuilder(imageBuffer, {
            name: `${messageInfo.characterName}-sheet.png`
        });

        // Create updated components with stored view mode and spec
        const dungeons = extractUniqueDungeons(characters);
        const components = createCharacterDetailComponents(
            true,
            characters,
            dungeons,
            viewMode,
            messageInfo.characterName,
            selectedCharacter.class,
            selectedSpec
        );

        // Update message with new image and components
        await message.edit({
            content: '',
            embeds: [],
            files: [attachment],
            components
        });

        logger.debug('Successfully updated character image', {
            messageId,
            characterName: messageInfo.characterName
        });

    } catch (error) {
        logger.error('Failed to update character image message', {
            messageId,
            characterName: messageInfo.characterName,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Export the command module
module.exports = {
    data: new SlashCommandBuilder()
        .setName('characters')
        .setDescription('Load Character Menu'),

    /**
     * Executes the characters command
     * @param {Object} interaction - Discord slash command interaction
     */
    async execute(interaction) {
        logger.debug('Character command executed');
        try {
            await showMainMenu(interaction, true);
            logger.debug('Main menu shown successfully');
        } catch (error) {
            logger.error('Error in characters execute function', { error: error.message, stack: error.stack });

            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'Failed to load character data. Please try again later.',
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    await interaction.editReply({
                        content: 'Failed to load character data. Please try again later.'
                    });
                }
            } catch (replyError) {
                logger.error('Failed to send error message in characters execute', { error: replyError.message });
            }
        }
    },

    /**
     * Handles all character-related interactions (buttons, select menus)
     * @param {Object} interaction - Discord component interaction
     */
    handleCharacterInteraction: async function(interaction) {
        try {
            // Get current character data for interactions
            const characters = await getCharacterData(false);

            switch (interaction.customId) {
                case COMPONENT_IDS.CHARACTER_SELECT:
                    await handleCharacterSelect(interaction, characters);
                    break;

                case COMPONENT_IDS.SPEC_SELECT:
                    await handleSpecSelect(interaction, characters);
                    break;

                case COMPONENT_IDS.DUNGEON_SELECT:
                    await handleDungeonSelect(interaction, characters);
                    break;

                case COMPONENT_IDS.REFRESH_DATA:
                    // Clear M+ cache for refresh and show main menu
                    cacheManager.refreshMplusData();
                    await showMainMenu(interaction, false, true);
                    break;

                case COMPONENT_IDS.MAIN_MENU:
                    await showMainMenu(interaction, false, false);
                    break;

                case COMPONENT_IDS.RAID_DATA:
                    await handleRaidMenu(interaction);
                    break;

                case COMPONENT_IDS.MPLUS_DATA:
                    await handleWeeklyRunsMenu(interaction);
                    break;

                case COMPONENT_IDS.LINKS_MENU:
                    await handleLinksMenu(interaction);
                    break;

                case COMPONENT_IDS.NOTES_PAGE:
                    await handleNotesPage(interaction);
                    break;

                // CHARACTER_IMAGE_WIP removed - image generation now integrated into character selection

                // Notes system component handlers
                case NOTES_COMPONENT_IDS.ADD_NOTE:
                    await handleAddNote(interaction);
                    break;

                case NOTES_COMPONENT_IDS.NOTE_SELECT:
                    await handleNoteSelection(interaction);
                    break;

                case NOTES_COMPONENT_IDS.NOTES_FILTER:
                    await handleNotesFilter(interaction);
                    break;

                case NOTES_COMPONENT_IDS.CLEANUP_NOTES:
                    await handleNotesCleanup(interaction);
                    break;

                // View mode button handlers - now handle both old format and character-specific format
                case COMPONENT_IDS.VIEW_MODE_DETAILED:
                    await handleViewModeChange(interaction, 'detailed');
                    break;

                case COMPONENT_IDS.VIEW_MODE_COMPACT:
                    await handleViewModeChange(interaction, 'compact');
                    break;

                case COMPONENT_IDS.VIEW_MODE_COMPARISON:
                    await handleViewModeChange(interaction, 'comparison');
                    break;

                default:
                    // Handle character-specific view mode buttons (format: char_view_mode_CharacterName)
                    if (interaction.customId.startsWith(COMPONENT_IDS.VIEW_MODE_DETAILED + '_')) {
                        await handleViewModeChange(interaction, 'detailed');
                    } else if (interaction.customId.startsWith(COMPONENT_IDS.VIEW_MODE_COMPACT + '_')) {
                        await handleViewModeChange(interaction, 'compact');
                    } else if (interaction.customId.startsWith(COMPONENT_IDS.VIEW_MODE_COMPARISON + '_')) {
                        await handleViewModeChange(interaction, 'comparison');
                    }
                    // Handle notes interactions with dynamic IDs (containing note IDs)
                    else if (interaction.customId.startsWith(NOTES_COMPONENT_IDS.EDIT_NOTE)) {
                        await handleEditNote(interaction);
                    } else if (interaction.customId.startsWith(NOTES_COMPONENT_IDS.DELETE_NOTE)) {
                        await handleDeleteNote(interaction);
                    } else if (interaction.customId.startsWith(NOTES_COMPONENT_IDS.COMPLETE_NOTE)) {
                        await handleCompleteNote(interaction);
                    } else if (interaction.customId.startsWith(NOTES_COMPONENT_IDS.UNCOMPLETE_NOTE)) {
                        await handleUncompleteNote(interaction);
                    } else {
                        logger.warn('Unhandled character interaction', { customId: interaction.customId });
                    }
                    break;
            }

        } catch (error) {
            logger.error('Error handling character interaction', { error: error.message, stack: error.stack, customId: interaction.customId });

            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'An error occurred. Please try the command again.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (replyError) {
                logger.error('Failed to send error reply in handleCharacterInteraction', { error: replyError.message });
            }
        }
    },

    /**
     * Handles modal submissions for the notes system
     * @param {Object} interaction - Discord modal submit interaction
     */
    handleModalSubmission: async function(interaction) {
        try {
            const modalId = interaction.customId;

            if (modalId === NOTES_MODAL_IDS.ADD_NOTE) {
                await handleAddNoteSubmission(interaction);
            } else if (modalId.startsWith(NOTES_MODAL_IDS.EDIT_NOTE)) {
                await handleEditNoteSubmission(interaction);
            } else {
                logger.warn('Unhandled modal submission', { customId: modalId });
            }

        } catch (error) {
            logger.error('Error handling modal submission', { error: error.message, stack: error.stack, customId: interaction.customId });

            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'An error occurred while processing your submission. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (replyError) {
                logger.error('Failed to send error reply in handleModalSubmission', { error: replyError.message });
            }
        }
    },

    /**
     * Initializes the auto-refresh system for all message types
     * @param {Object} client - Discord client instance
     */
    initAutoRefresh: function(client) {
        logger.info('Initializing auto-refresh system');

        // Clear existing interval if present
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }

        // Set up auto-refresh interval (every 30 minutes)
        const REFRESH_INTERVAL = 30 * 60 * 1000;
        autoRefreshInterval = setInterval(async () => {
            logger.debug('Auto-refresh triggered, updating all active messages');
            await autoRefreshAllMessages(client);
        }, REFRESH_INTERVAL);

        logger.info('Auto-refresh initialized', { intervalMinutes: 30 });
    },

    /**
     * Cleans up resources when the bot shuts down
     */
    cleanup: function() {
        logger.info('Cleaning up characters command resources');

        // Clear auto-refresh interval
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }

        // Clear tracking maps
        activeMessages.clear();

        // Clear caches
        cacheManager.clear();

        logger.info('Characters command cleanup complete');
    }
};