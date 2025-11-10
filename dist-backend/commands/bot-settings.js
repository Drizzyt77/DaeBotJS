/**
 * Bot Settings Command - Manage Global Bot Configuration
 *
 * This Discord slash command allows admins to configure bot-wide settings:
 * - Current season information (Blizzard API and RaiderIO)
 * - Default region for API calls
 * - Active dungeon pool for current season
 *
 * Features:
 * - /bot-settings view: Display all current settings
 * - /bot-settings set-season: Update season ID and name
 * - /bot-settings set-region: Update default region
 * - /bot-settings set-dungeons: Update active dungeon pool
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { getConfigService } = require('../services/config-service');

/**
 * Color scheme for different embed states
 */
const EMBED_COLORS = {
    SUCCESS: 0x00FF00,      // Green for successful operations
    ERROR: 0xFF0000,        // Red for errors
    INFO: 0x0099FF          // Blue for informational messages
};

/**
 * Valid region codes
 */
const VALID_REGIONS = ['us', 'eu', 'kr', 'tw', 'cn'];

/**
 * Create an error embed
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

/**
 * Create a success embed
 * @param {string} title - Success title
 * @param {string} description - Success description
 * @returns {EmbedBuilder} Success embed
 */
function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setColor(EMBED_COLORS.SUCCESS)
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot-settings')
        .setDescription('Manage global bot configuration settings (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View all current bot settings')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-season')
                .setDescription('Update current season information')
                .addIntegerOption(option =>
                    option
                        .setName('season-id')
                        .setDescription('Blizzard API season ID (e.g., 15)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100)
                )
                .addStringOption(option =>
                    option
                        .setName('season-name')
                        .setDescription('RaiderIO season name (e.g., season-tww-3)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-region')
                .setDescription('Update default region')
                .addStringOption(option =>
                    option
                        .setName('region')
                        .setDescription('Default region code')
                        .setRequired(true)
                        .addChoices(
                            { name: 'US - Americas', value: 'us' },
                            { name: 'EU - Europe', value: 'eu' },
                            { name: 'KR - Korea', value: 'kr' },
                            { name: 'TW - Taiwan', value: 'tw' },
                            { name: 'CN - China', value: 'cn' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-dungeons')
                .setDescription('Update active dungeon pool (opens a modal)')
        ),

    /**
     * Executes the bot-settings command
     * @param {ChatInputCommandInteraction} interaction - Discord slash command interaction
     */
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const configService = getConfigService();

        try {
            switch (subcommand) {
                case 'view': {
                    await interaction.deferReply();

                    const settings = configService.getAllSettings();

                    const embed = new EmbedBuilder()
                        .setTitle('⚙️ Bot Settings')
                        .setDescription('Current bot configuration settings')
                        .setColor(EMBED_COLORS.INFO)
                        .setTimestamp();

                    // Season info
                    embed.addFields({
                        name: '🎮 Current Season',
                        value: [
                            `**Season ID (Blizzard):** ${settings.currentSeasonId}`,
                            `**Season Name (RaiderIO):** ${settings.currentSeasonName}`
                        ].join('\n'),
                        inline: false
                    });

                    // Region info
                    embed.addFields({
                        name: '🌍 Default Region',
                        value: `**${settings.defaultRegion.toUpperCase()}**`,
                        inline: true
                    });

                    // Dungeon pool
                    const dungeonList = settings.activeDungeons.length > 0
                        ? settings.activeDungeons.map(d => `• ${d}`).join('\n')
                        : 'No dungeons configured';

                    embed.addFields({
                        name: `🗺️ Active Dungeons (${settings.activeDungeons.length})`,
                        value: dungeonList,
                        inline: false
                    });

                    // Last updated
                    const lastUpdated = new Date(settings.updatedAt);
                    embed.addFields({
                        name: '🕒 Last Updated',
                        value: `<t:${Math.floor(lastUpdated.getTime() / 1000)}:R>`,
                        inline: true
                    });

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'set-season': {
                    await interaction.deferReply();

                    const seasonId = interaction.options.getInteger('season-id');
                    const seasonName = interaction.options.getString('season-name');

                    // Validate season name format
                    if (!/^season-[a-z]+-\d+$/i.test(seasonName)) {
                        const errorEmbed = createErrorEmbed(
                            'Invalid Season Name',
                            'Season name must follow the format: `season-{expansion}-{number}` (e.g., `season-tww-3`)'
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }

                    // Update settings
                    const success = configService.setSeasonInfo(seasonId, seasonName);

                    if (!success) {
                        const errorEmbed = createErrorEmbed(
                            'Update Failed',
                            'Failed to update season information. Please try again.'
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }

                    const successEmbed = createSuccessEmbed(
                        'Season Updated',
                        `Season information has been updated successfully.`
                    );

                    successEmbed.addFields({
                        name: '📋 New Settings',
                        value: [
                            `**Season ID:** ${seasonId}`,
                            `**Season Name:** ${seasonName}`
                        ].join('\n'),
                        inline: false
                    });

                    await interaction.editReply({ embeds: [successEmbed] });

                    logger.logConfigChange('SET_SEASON', `season: ${seasonId}, name: ${seasonName}`, interaction.user, {
                        seasonId,
                        seasonName
                    });

                    break;
                }

                case 'set-region': {
                    await interaction.deferReply();

                    const region = interaction.options.getString('region');

                    // Validate region
                    if (!VALID_REGIONS.includes(region.toLowerCase())) {
                        const errorEmbed = createErrorEmbed(
                            'Invalid Region',
                            `Region must be one of: ${VALID_REGIONS.join(', ').toUpperCase()}`
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }

                    // Update settings
                    const success = configService.setDefaultRegion(region);

                    if (!success) {
                        const errorEmbed = createErrorEmbed(
                            'Update Failed',
                            'Failed to update default region. Please try again.'
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }

                    const successEmbed = createSuccessEmbed(
                        'Region Updated',
                        `Default region has been set to **${region.toUpperCase()}**.`
                    );

                    await interaction.editReply({ embeds: [successEmbed] });

                    logger.logConfigChange('SET_REGION', `region: ${region}`, interaction.user, {
                        region
                    });

                    break;
                }

                case 'set-dungeons': {
                    // Show modal for dungeon input
                    const currentDungeons = configService.getActiveDungeons();
                    const dungeonText = currentDungeons.join('\n');

                    const modal = new ModalBuilder()
                        .setCustomId('bot_settings_dungeons_modal')
                        .setTitle('Update Active Dungeon Pool');

                    const dungeonInput = new TextInputBuilder()
                        .setCustomId('dungeon_list')
                        .setLabel('Dungeon Names (one per line)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setValue(dungeonText)
                        .setPlaceholder('Ara-Kara, City of Echoes\nThe Dawnbreaker\n...')
                        .setRequired(true)
                        .setMaxLength(1000);

                    const row = new ActionRowBuilder().addComponents(dungeonInput);
                    modal.addComponents(row);

                    await interaction.showModal(modal);
                    break;
                }

                default:
                    throw new Error(`Unknown subcommand: ${subcommand}`);
            }

        } catch (error) {
            logger.error('Error in bot-settings command', {
                error: error.message,
                stack: error.stack,
                subcommand,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });

            const errorEmbed = createErrorEmbed(
                'Error',
                'An unexpected error occurred while updating settings. Please try again.'
            );

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            } catch (replyError) {
                logger.error('Failed to send error reply in bot-settings', {
                    error: replyError.message
                });
            }
        }
    },

    /**
     * Handle modal submit for dungeon list
     * @param {ModalSubmitInteraction} interaction - Modal submit interaction
     */
    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'bot_settings_dungeons_modal') {
            return;
        }

        await interaction.deferReply();

        try {
            const configService = getConfigService();
            const dungeonListText = interaction.fields.getTextInputValue('dungeon_list');

            // Parse dungeons (one per line, trim whitespace)
            const dungeons = dungeonListText
                .split('\n')
                .map(d => d.trim())
                .filter(d => d.length > 0);

            if (dungeons.length === 0) {
                const errorEmbed = createErrorEmbed(
                    'Invalid Input',
                    'You must provide at least one dungeon name.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            if (dungeons.length > 20) {
                const errorEmbed = createErrorEmbed(
                    'Too Many Dungeons',
                    'Maximum of 20 dungeons allowed.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Update settings
            const success = configService.setActiveDungeons(dungeons);

            if (!success) {
                const errorEmbed = createErrorEmbed(
                    'Update Failed',
                    'Failed to update dungeon pool. Please try again.'
                );
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            const successEmbed = createSuccessEmbed(
                'Dungeons Updated',
                `Active dungeon pool has been updated with ${dungeons.length} dungeons.`
            );

            successEmbed.addFields({
                name: '🗺️ New Dungeon Pool',
                value: dungeons.map(d => `• ${d}`).join('\n'),
                inline: false
            });

            await interaction.editReply({ embeds: [successEmbed] });

            logger.logConfigChange('SET_DUNGEONS', `dungeon count: ${dungeons.length}`, interaction.user, {
                dungeonCount: dungeons.length,
                dungeons
            });

        } catch (error) {
            logger.error('Error handling dungeon modal submit', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id
            });

            const errorEmbed = createErrorEmbed(
                'Error',
                'An unexpected error occurred while updating dungeons. Please try again.'
            );

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
