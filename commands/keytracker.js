/**
 * Key Tracker Command - Individual Character Mythic+ History
 *
 * This Discord slash command allows users to look up any character's
 * Mythic+ key history for the past 2 weekly resets.
 *
 * Features:
 * - Accepts realm and character name as input parameters
 * - Shows runs from the past 2 weekly reset periods
 * - Displays key level, dungeon, completion status, and timing
 * - Automatically handles WoW weekly reset calculations
 * - Provides external links to character profiles
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { RaiderIOClient } = require('../services/raiderio-client');
const weeklyHelper = require('../helpers/weekly');
const { getTimedSymbol, getClassIcon, getRoleIcon } = require('../utils/data-formatters');
const logger = require('../utils/logger');

// Initialize RaiderIO client for API requests
const raiderIOClient = new RaiderIOClient();

/**
 * Color scheme for different embed states
 */
const EMBED_COLORS = {
    SUCCESS: 0x00FF00,      // Green for successful data retrieval
    WARNING: 0xFF6600,      // Orange for partial data or warnings
    ERROR: 0xFF0000,        // Red for errors
    NO_DATA: 0x808080       // Gray for no data found
};

/**
 * Filters runs to only include those from the past 2 weekly resets
 * @param {Array} runs - Array of run objects with completed_at timestamps
 * @returns {Object} Object with currentWeek and previousWeek run arrays
 */
function filterRunsByResetPeriods(runs) {
    const currentReset = weeklyHelper.getLastTuesdayReset();
    const previousReset = new Date(currentReset.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days earlier
    const twoResetsAgo = new Date(previousReset.getTime() - (7 * 24 * 60 * 60 * 1000)); // 14 days earlier

    const currentWeekRuns = [];
    const previousWeekRuns = [];

    runs.forEach(run => {
        const runDate = new Date(run.completed_at);

        if (runDate >= currentReset) {
            currentWeekRuns.push(run);
        } else if (runDate >= previousReset && runDate < currentReset) {
            previousWeekRuns.push(run);
        }
        // Ignore runs older than 2 resets
    });

    return {
        currentWeek: currentWeekRuns.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)),
        previousWeek: previousWeekRuns.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)),
        currentReset,
        previousReset
    };
}

/**
 * Formats a list of runs for display in an embed field
 * @param {Array} runs - Array of run objects
 * @returns {string} Formatted string for display
 */
function formatRunsList(runs) {
    if (runs.length === 0) {
        return 'No runs found';
    }

    return runs.map(run => {
        const timedSymbol = getTimedSymbol(run.num_keystone_upgrades);
        const completedDate = new Date(run.completed_at);
        const dateString = completedDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        return `**${run.mythic_level}${timedSymbol}** ${run.dungeon} *(${dateString})*`;
    }).join('\n');
}

/**
 * Creates an error embed for various error states
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @param {string} color - Embed color (optional)
 * @returns {EmbedBuilder} Discord embed for error display
 */
function createErrorEmbed(title, description, color = EMBED_COLORS.ERROR) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
}

/**
 * Validates and normalizes input parameters
 * @param {string} realm - Realm name input
 * @param {string} characterName - Character name input
 * @returns {Object} Validated parameters object
 */
function validateInputs(realm, characterName) {
    // Normalize realm name (remove spaces, convert to lowercase)
    const normalizedRealm = realm.trim().replace(/\s+/g, '-').toLowerCase();

    // Normalize character name (capitalize first letter, remove special characters)
    const normalizedCharacter = characterName.trim()
        .replace(/[^a-zA-Z]/g, '')
        .toLowerCase()
        .replace(/^./, str => str.toUpperCase());

    // Basic validation
    if (normalizedRealm.length === 0) {
        throw new Error('Realm name cannot be empty');
    }

    if (normalizedCharacter.length === 0) {
        throw new Error('Character name cannot be empty');
    }

    if (normalizedCharacter.length < 2 || normalizedCharacter.length > 12) {
        throw new Error('Character name must be between 2 and 12 characters');
    }

    return {
        realm: normalizedRealm,
        character: normalizedCharacter
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('keytracker')
        .setDescription('Track Mythic+ keys for any character over the past 2 weekly resets')
        .addStringOption(option =>
            option
                .setName('realm')
                .setDescription('WoW realm name (e.g., "Stormrage", "Area-52")')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('character')
                .setDescription('Character name to look up')
                .setRequired(true)
        ),

    /**
     * Executes the keytracker command
     * @param {ChatInputCommandInteraction} interaction - Discord slash command interaction
     */
    async execute(interaction) {
        const realm = interaction.options.getString('realm');
        const characterName = interaction.options.getString('character');

        logger.info('Key tracker command executed', { characterName, realm });

        // Defer reply since API calls may take time
        await interaction.deferReply();

        try {
            // Validate and normalize inputs
            const { realm: normalizedRealm, character: normalizedCharacter } = validateInputs(realm, characterName);

            logger.debug('Looking up character', { character: normalizedCharacter, realm: normalizedRealm });

            // Fetch recent runs data from RaiderIO
            // Note: Current RaiderIO client is hardcoded to US/Thrall - we'll create a custom request
            const url = raiderIOClient.buildApiUrl(normalizedCharacter, 'mythic_plus_recent_runs', 'us', normalizedRealm);
            const rawData = await raiderIOClient.makeRequest(url, normalizedCharacter);
            const characterData = rawData ? [raiderIOClient.parseRecentRunsData(rawData, normalizedCharacter)] : [];

            if (characterData.length === 0) {
                const errorEmbed = createErrorEmbed(
                    'Character Not Found',
                    `Could not find character **${normalizedCharacter}** on realm **${normalizedRealm}**.\n\n` +
                    `Please check:\n` +
                    `• Character name spelling\n` +
                    `• Realm name (use hyphens for spaces: "Area-52")\n` +
                    `• Character has completed Mythic+ dungeons recently`,
                    EMBED_COLORS.WARNING
                );

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            const character = characterData[0];
            const recentRuns = character.recent_runs || [];

            if (recentRuns.length === 0) {
                const noRunsEmbed = createErrorEmbed(
                    'No Recent Runs Found',
                    `**${character.name}** (${character.class}) has no recent Mythic+ runs recorded.\n\n` +
                    `This could mean:\n` +
                    `• Character hasn't done keys recently\n` +
                    `• RaiderIO hasn't updated yet\n` +
                    `• Character is on a different realm`,
                    EMBED_COLORS.NO_DATA
                );

                await interaction.editReply({ embeds: [noRunsEmbed] });
                return;
            }

            // Filter runs by reset periods
            const { currentWeek, previousWeek, currentReset, previousReset } = filterRunsByResetPeriods(recentRuns);

            // Create main embed
            const embed = new EmbedBuilder()
                .setTitle(`${getClassIcon(character.class)} ${character.name} - Key Tracker`)
                .setDescription(`${getRoleIcon(character.role)} **${character.class}** on **${normalizedRealm}**`)
                .setColor(EMBED_COLORS.SUCCESS)
                .setTimestamp();

            // Add current week runs
            const currentWeekFormatted = formatRunsList(currentWeek);
            embed.addFields({
                name: `📅 Current Week (Since <t:${Math.floor(currentReset.getTime() / 1000)}:D>)`,
                value: currentWeekFormatted,
                inline: false
            });

            // Add previous week runs
            const previousWeekFormatted = formatRunsList(previousWeek);
            embed.addFields({
                name: `📅 Previous Week (<t:${Math.floor(previousReset.getTime() / 1000)}:D> - <t:${Math.floor(currentReset.getTime() / 1000)}:D>)`,
                value: previousWeekFormatted,
                inline: false
            });

            // Add summary statistics
            const totalRuns = currentWeek.length + previousWeek.length;
            const currentWeekHighest = currentWeek.length > 0 ? Math.max(...currentWeek.map(r => r.mythic_level)) : 0;
            const previousWeekHighest = previousWeek.length > 0 ? Math.max(...previousWeek.map(r => r.mythic_level)) : 0;
            const overallHighest = Math.max(currentWeekHighest, previousWeekHighest);

            let summaryText = `**Total Runs:** ${totalRuns}`;
            if (overallHighest > 0) {
                summaryText += `\n**Highest Key:** +${overallHighest}`;
            }

            embed.addFields({
                name: '📊 Summary',
                value: summaryText,
                inline: true
            });

            // Add character links
            const raiderIOLink = `https://raider.io/characters/us/${normalizedRealm}/${normalizedCharacter}`;
            const warcraftLogsLink = `https://www.warcraftlogs.com/character/us/${normalizedRealm}/${normalizedCharacter}`;

            embed.addFields({
                name: '🔗 Character Links',
                value: `[RaiderIO](${raiderIOLink}) | [WarcraftLogs](${warcraftLogsLink})`,
                inline: true
            });

            await interaction.editReply({ embeds: [embed] });

            logger.info('Successfully displayed key tracker', { characterName: character.name, totalRuns });

        } catch (error) {
            logger.error('Error in keytracker command', { error: error.message, stack: error.stack, characterName, realm });

            let errorMessage = 'An unexpected error occurred while fetching character data.';
            let errorTitle = 'Error';

            // Handle specific error types
            if (error.message.includes('Character name') || error.message.includes('Realm name')) {
                errorMessage = error.message;
                errorTitle = 'Invalid Input';
            } else if (error.name === 'RaiderIOError') {
                if (error.statusCode === 404) {
                    errorMessage = `Character **${characterName}** not found on **${realm}**. Please check the character name and realm.`;
                    errorTitle = 'Character Not Found';
                } else if (error.statusCode === 429) {
                    errorMessage = 'RaiderIO API rate limit exceeded. Please try again in a few minutes.';
                    errorTitle = 'Rate Limited';
                } else {
                    errorMessage = `RaiderIO API error: ${error.message}`;
                    errorTitle = 'API Error';
                }
            }

            const errorEmbed = createErrorEmbed(errorTitle, errorMessage);

            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (replyError) {
                logger.error('Failed to send error reply in keytracker', { error: replyError.message });
            }
        }
    }
};