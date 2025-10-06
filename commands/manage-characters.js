/**
 * Manage Characters Command - Add or Remove Characters from Config
 *
 * This Discord slash command allows authorized users to add or remove
 * character names from the bot's configuration file.
 *
 * Features:
 * - Add new character names to the tracking list
 * - Remove existing characters from the tracking list
 * - Input validation and duplicate checking
 * - Real-time config file updates
 * - Confirmation messages with current character list
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const weeklyCsvLogger = require('../utils/weekly-csv-logger');

// Path to the config file
const CONFIG_PATH = path.join(__dirname, '../config.json');

/**
 * Color scheme for different embed states
 */
const EMBED_COLORS = {
    SUCCESS: 0x00FF00,      // Green for successful operations
    ERROR: 0xFF0000,        // Red for errors
    INFO: 0x0099FF          // Blue for informational messages
};

/**
 * Loads the current configuration from file
 * @returns {Object} Configuration object
 */
function loadConfig() {
    try {
        const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        logger.error('Error loading config', { error: error.message });
        throw new Error('Failed to load configuration file');
    }
}

/**
 * Saves the configuration to file
 * @param {Object} config - Configuration object to save
 */
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
    } catch (error) {
        logger.error('Error saving config', { error: error.message });
        throw new Error('Failed to save configuration file');
    }
}

/**
 * Validates and normalizes character name input
 * @param {string} characterName - Raw character name input
 * @returns {string} Normalized character name
 */
function validateCharacterName(characterName) {
    // Remove special characters and normalize capitalization
    const normalized = characterName.trim()
        .replace(/[^a-zA-Z]/g, '')
        .toLowerCase()
        .replace(/^./, str => str.toUpperCase());

    // Basic validation
    if (normalized.length < 2 || normalized.length > 12) {
        throw new Error('Character name must be between 2 and 12 characters');
    }

    return normalized;
}

/**
 * Creates a success embed showing the updated character list
 * @param {string} action - Action performed (Added/Removed)
 * @param {string} characterName - Character name that was modified
 * @param {Array} updatedList - Current character list after modification
 * @returns {EmbedBuilder} Success embed
 */
function createSuccessEmbed(action, characterName, updatedList) {
    const embed = new EmbedBuilder()
        .setTitle(`✅ Character ${action}`)
        .setDescription(`**${characterName}** has been ${action.toLowerCase()} ${action === 'Added' ? 'to' : 'from'} the character list.`)
        .setColor(EMBED_COLORS.SUCCESS)
        .setTimestamp();

    // Add current character list
    if (updatedList.length > 0) {
        const characterDisplay = updatedList
            .sort()
            .map((char, index) => `${index + 1}. ${char}`)
            .join('\n');

        embed.addFields({
            name: `📋 Current Characters (${updatedList.length})`,
            value: characterDisplay,
            inline: false
        });
    } else {
        embed.addFields({
            name: '📋 Current Characters',
            value: 'No characters configured',
            inline: false
        });
    }

    return embed;
}

/**
 * Creates an error embed for various error states
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @returns {EmbedBuilder} Error embed
 */
function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setColor(EMBED_COLORS.ERROR)
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manage-characters')
        .setDescription('Add or remove characters from the bot configuration')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a character to the tracking list')
                .addStringOption(option =>
                    option
                        .setName('character')
                        .setDescription('Character name to add')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a character from the tracking list')
                .addStringOption(option =>
                    option
                        .setName('character')
                        .setDescription('Character name to remove')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Display the current character list')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('csv-stats')
                .setDescription('Display CSV log statistics and file information')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('export-csv')
                .setDescription('Manually trigger CSV export of current M+ data')
        ),

    /**
     * Handles autocomplete for the remove subcommand
     * @param {AutocompleteInteraction} interaction - Discord autocomplete interaction
     */
    async autocomplete(interaction) {
        if (interaction.commandName !== 'manage-characters') return;

        const subcommand = interaction.options.getSubcommand();
        if (subcommand !== 'remove') return;

        try {
            const config = loadConfig();
            const focusedValue = interaction.options.getFocused().toLowerCase();

            const filtered = config.characters
                .filter(character => character.toLowerCase().includes(focusedValue))
                .slice(0, 25); // Discord limit

            await interaction.respond(
                filtered.map(character => ({
                    name: character,
                    value: character
                }))
            );
        } catch (error) {
            logger.error('Error in manage-characters autocomplete', { error: error.message });
            await interaction.respond([]);
        }
    },

    /**
     * Executes the manage-characters command
     * @param {ChatInputCommandInteraction} interaction - Discord slash command interaction
     */
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // Defer reply since file operations may take time
        await interaction.deferReply();

        try {
            const config = loadConfig();

            switch (subcommand) {
                case 'add': {
                    const rawCharacterName = interaction.options.getString('character');
                    const characterName = validateCharacterName(rawCharacterName);

                    // Check if character already exists
                    if (config.characters.includes(characterName)) {
                        const errorEmbed = createErrorEmbed(
                            'Character Already Exists',
                            `**${characterName}** is already in the character list.`
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }

                    // Add character to the list
                    config.characters.push(characterName);
                    saveConfig(config);

                    const successEmbed = createSuccessEmbed('Added', characterName, config.characters);
                    await interaction.editReply({ embeds: [successEmbed] });

                    logger.logConfigChange('ADD', `character: ${characterName}`, interaction.user, {
                        characterName,
                        totalCharacters: config.characters.length
                    });
                    break;
                }

                case 'remove': {
                    const characterName = interaction.options.getString('character');

                    // Check if character exists
                    const characterIndex = config.characters.indexOf(characterName);
                    if (characterIndex === -1) {
                        const errorEmbed = createErrorEmbed(
                            'Character Not Found',
                            `**${characterName}** is not in the character list.`
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }

                    // Remove character from the list
                    config.characters.splice(characterIndex, 1);
                    saveConfig(config);

                    const successEmbed = createSuccessEmbed('Removed', characterName, config.characters);
                    await interaction.editReply({ embeds: [successEmbed] });

                    logger.logConfigChange('REMOVE', `character: ${characterName}`, interaction.user, {
                        characterName,
                        totalCharacters: config.characters.length
                    });
                    break;
                }

                case 'list': {
                    const embed = new EmbedBuilder()
                        .setTitle('📋 Current Character List')
                        .setColor(EMBED_COLORS.INFO)
                        .setTimestamp();

                    if (config.characters.length > 0) {
                        const characterDisplay = config.characters
                            .sort()
                            .map((char, index) => `${index + 1}. ${char}`)
                            .join('\n');

                        embed.setDescription(`**Total Characters:** ${config.characters.length}`);
                        embed.addFields({
                            name: 'Characters',
                            value: characterDisplay,
                            inline: false
                        });
                    } else {
                        embed.setDescription('No characters are currently configured.');
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'csv-stats': {
                    const stats = weeklyCsvLogger.getLogStats();

                    const embed = new EmbedBuilder()
                        .setTitle('📊 CSV Log Statistics')
                        .setColor(EMBED_COLORS.INFO)
                        .setTimestamp();

                    if (stats.error) {
                        embed.setDescription(`Error retrieving statistics: ${stats.details}`)
                            .setColor(EMBED_COLORS.ERROR);
                    } else {
                        embed.setDescription(`Weekly M+ CSV logging statistics`);

                        // Current file info
                        if (stats.currentFile) {
                            let currentFileInfo = `**File:** ${stats.currentFile}`;
                            if (stats.currentFileSize) {
                                const sizeKB = Math.round(stats.currentFileSize / 1024);
                                currentFileInfo += `\n**Size:** ${sizeKB} KB`;
                            }
                            if (stats.currentFileLines) {
                                currentFileInfo += `\n**Entries:** ${stats.currentFileLines - 1} rows`; // -1 for header
                            }

                            embed.addFields({
                                name: '📄 Current Week File',
                                value: currentFileInfo,
                                inline: false
                            });
                        }

                        // Summary stats
                        const summaryInfo = [
                            `**Total CSV Files:** ${stats.totalFiles}`,
                            `**Oldest File:** ${stats.oldestFile || 'None'}`,
                            `**Newest File:** ${stats.newestFile || 'None'}`
                        ].join('\n');

                        embed.addFields({
                            name: '📈 Overview',
                            value: summaryInfo,
                            inline: false
                        });

                        // Recent files
                        if (stats.fileList && stats.fileList.length > 0) {
                            const recentFiles = stats.fileList
                                .slice(-5) // Last 5 files
                                .reverse()
                                .map(file => `• ${file}`)
                                .join('\n');

                            embed.addFields({
                                name: '📋 Recent Files',
                                value: recentFiles,
                                inline: false
                            });
                        }
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'export-csv': {
                    try {
                        // Import data helper to get current M+ data
                        const data = require('../helpers/get-data');

                        await interaction.editReply({
                            content: '⏳ Fetching current M+ data for CSV export...'
                        });

                        // Get fresh M+ data
                        const mplusData = await data.get_data();

                        if (!mplusData || mplusData.length === 0) {
                            const errorEmbed = createErrorEmbed(
                                'No Data Available',
                                'No M+ data available to export to CSV.'
                            );
                            await interaction.editReply({ content: '', embeds: [errorEmbed] });
                            return;
                        }

                        // Log to CSV
                        weeklyCsvLogger.logWeeklyData(mplusData);

                        // Get updated stats
                        const stats = weeklyCsvLogger.getLogStats();

                        const successEmbed = new EmbedBuilder()
                            .setTitle('✅ CSV Export Complete')
                            .setDescription(`Successfully exported M+ data for ${mplusData.length} characters to CSV.`)
                            .setColor(EMBED_COLORS.SUCCESS)
                            .setTimestamp();

                        if (stats.currentFile) {
                            successEmbed.addFields({
                                name: '📄 File Information',
                                value: [
                                    `**File:** ${stats.currentFile}`,
                                    `**Size:** ${Math.round(stats.currentFileSize / 1024)} KB`,
                                    `**Total Entries:** ${stats.currentFileLines - 1} rows`
                                ].join('\n'),
                                inline: false
                            });
                        }

                        // Log the manual export
                        logger.logConfigChange('EXPORT_CSV', 'manual M+ data export', interaction.user, {
                            characterCount: mplusData.length,
                            fileName: stats.currentFile
                        });

                        await interaction.editReply({ content: '', embeds: [successEmbed] });

                    } catch (error) {
                        logger.error('Error in manual CSV export', {
                            error: error.message,
                            stack: error.stack,
                            userId: interaction.user.id
                        });

                        const errorEmbed = createErrorEmbed(
                            'Export Failed',
                            'Failed to export M+ data to CSV. Please try again later.'
                        );
                        await interaction.editReply({ content: '', embeds: [errorEmbed] });
                    }
                    break;
                }

                default:
                    throw new Error(`Unknown subcommand: ${subcommand}`);
            }

        } catch (error) {
            logger.error('Error in manage-characters command', {
                error: error.message,
                stack: error.stack,
                subcommand,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });

            let errorMessage = 'An unexpected error occurred while managing characters.';
            let errorTitle = 'Error';

            // Handle specific error types
            if (error.message.includes('Character name must be')) {
                errorMessage = error.message;
                errorTitle = 'Invalid Character Name';
            } else if (error.message.includes('Failed to load') || error.message.includes('Failed to save')) {
                errorMessage = 'Unable to access configuration file. Please contact an administrator.';
                errorTitle = 'Configuration Error';
            }

            const errorEmbed = createErrorEmbed(errorTitle, errorMessage);

            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (replyError) {
                logger.error('Failed to send error reply in manage-characters', { error: replyError.message });
            }
        }
    }
};