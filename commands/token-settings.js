/**
 * Token Settings Command - Manage WoW Token Price Notifications
 *
 * This Discord slash command allows users to configure WoW token price tracking:
 * - Set the gold threshold for price alerts (admin only)
 * - Enable/disable personal DM notifications
 * - View current settings and statistics
 *
 * Features:
 * - /set token-threshold: Configure the minimum price for alerts (requires ban permission)
 * - /enable-token-dms: Toggle personal DM notifications
 * - /token-status: View current token price and settings
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
const { getTokenDatabase } = require('../database/token-db');

/**
 * Color scheme for different embed states
 */
const EMBED_COLORS = {
    SUCCESS: 0x00FF00,      // Green for successful operations
    ERROR: 0xFF0000,        // Red for errors
    INFO: 0x0099FF,         // Blue for informational messages
    WARNING: 0xFFD700       // Gold for warnings
};

/**
 * Format gold amount with proper separators
 * @param {number} gold - Gold amount
 * @returns {string} Formatted gold string
 */
function formatGold(gold) {
    return `${gold.toLocaleString()}g`;
}

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('token-settings')
        .setDescription('Manage WoW token price notification settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-threshold')
                .setDescription('Set the gold threshold for token price alerts (admin only)')
                .addIntegerOption(option =>
                    option
                        .setName('gold')
                        .setDescription('Minimum gold price for alerts (e.g., 300000)')
                        .setRequired(true)
                        .setMinValue(50000)
                        .setMaxValue(1000000)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable-dms')
                .setDescription('Toggle personal DM notifications for token price alerts')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current token price and notification settings')
        ),

    /**
     * Executes the token-settings command
     * @param {ChatInputCommandInteraction} interaction - Discord slash command interaction
     */
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // Defer reply for potential database operations
        await interaction.deferReply({ ephemeral: subcommand === 'enable-dms' });

        try {
            const db = getTokenDatabase();

            switch (subcommand) {
                case 'set-threshold': {
                    // Check permissions (requires ban members permission)
                    if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
                        const errorEmbed = createErrorEmbed(
                            'Permission Denied',
                            'You need **Ban Members** permission to change the token threshold.'
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }

                    const threshold = interaction.options.getInteger('gold');

                    // Validate threshold
                    if (threshold < 50000 || threshold > 1000000) {
                        const errorEmbed = createErrorEmbed(
                            'Invalid Threshold',
                            'Threshold must be between **50,000g** and **1,000,000g**.'
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }

                    // Save threshold
                    const success = db.setThreshold(threshold);

                    if (!success) {
                        const errorEmbed = createErrorEmbed(
                            'Database Error',
                            'Failed to update threshold. Please try again.'
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }

                    // Success embed
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Threshold Updated')
                        .setDescription(`Token price alert threshold has been set to **${formatGold(threshold)}**.`)
                        .setColor(EMBED_COLORS.SUCCESS)
                        .setTimestamp()
                        .addFields({
                            name: 'ℹ️ Note',
                            value: 'Notifications will be sent when the token price reaches or exceeds this amount.',
                            inline: false
                        });

                    await interaction.editReply({ embeds: [embed] });

                    logger.logConfigChange('TOKEN_THRESHOLD', `threshold: ${threshold}`, interaction.user, {
                        threshold,
                        thresholdFormatted: formatGold(threshold)
                    });

                    break;
                }

                case 'enable-dms': {
                    const userId = interaction.user.id;
                    const currentSetting = db.getUserDMEnabled(userId);
                    const newSetting = !currentSetting;

                    // Toggle DM setting
                    const success = db.setUserDMEnabled(userId, newSetting);

                    if (!success) {
                        const errorEmbed = createErrorEmbed(
                            'Database Error',
                            'Failed to update your DM preferences. Please try again.'
                        );
                        await interaction.editReply({ embeds: [errorEmbed] });
                        return;
                    }

                    // Success embed
                    const embed = new EmbedBuilder()
                        .setTitle(newSetting ? '✅ DMs Enabled' : '🔕 DMs Disabled')
                        .setColor(newSetting ? EMBED_COLORS.SUCCESS : EMBED_COLORS.WARNING)
                        .setTimestamp();

                    if (newSetting) {
                        embed.setDescription(
                            '🔔 You will now receive direct messages when the token price exceeds the threshold.'
                        );
                    } else {
                        embed.setDescription(
                            '🔕 You will no longer receive direct messages for token price alerts.'
                        );
                    }

                    const threshold = db.getThreshold();
                    embed.addFields({
                        name: 'Current Threshold',
                        value: formatGold(threshold),
                        inline: true
                    });

                    await interaction.editReply({ embeds: [embed] });

                    logger.info('User toggled token DM preference', {
                        userId,
                        username: interaction.user.username,
                        enabled: newSetting
                    });

                    break;
                }

                case 'status': {
                    const stats = db.getStats();
                    const latestPrice = stats.latest_price;

                    const embed = new EmbedBuilder()
                        .setTitle('🪙 WoW Token Status')
                        .setColor(EMBED_COLORS.INFO)
                        .setTimestamp();

                    // Current price
                    if (latestPrice) {
                        const priceAboveThreshold = latestPrice.price >= stats.threshold;
                        const priceEmoji = priceAboveThreshold ? '🔴' : '🟢';

                        embed.addFields({
                            name: `${priceEmoji} Current Price`,
                            value: `**${formatGold(latestPrice.price)}**`,
                            inline: true
                        });

                        const priceDate = new Date(latestPrice.timestamp);
                        embed.addFields({
                            name: '🕒 Last Updated',
                            value: `<t:${Math.floor(priceDate.getTime() / 1000)}:R>`,
                            inline: true
                        });
                    } else {
                        embed.addFields({
                            name: '💰 Current Price',
                            value: 'No data available yet',
                            inline: true
                        });
                    }

                    // Threshold
                    embed.addFields({
                        name: '🎯 Alert Threshold',
                        value: formatGold(stats.threshold),
                        inline: true
                    });

                    // User's DM setting
                    const userDMEnabled = db.getUserDMEnabled(interaction.user.id);
                    embed.addFields({
                        name: '📬 Your DM Notifications',
                        value: userDMEnabled ? '✅ Enabled' : '❌ Disabled',
                        inline: true
                    });

                    // Total users with DMs enabled
                    embed.addFields({
                        name: '👥 Total Users Subscribed',
                        value: `${stats.users_with_dm} user${stats.users_with_dm !== 1 ? 's' : ''}`,
                        inline: true
                    });

                    // Price history count
                    if (stats.total_prices > 0) {
                        embed.addFields({
                            name: '📊 Price Records',
                            value: `${stats.total_prices} recorded`,
                            inline: true
                        });
                    }

                    embed.setDescription(
                        'Use `/token-settings enable-dms` to toggle DM notifications.\n' +
                        'Admins can use `/token-settings set-threshold` to change the alert threshold.'
                    );

                    await interaction.editReply({ embeds: [embed] });

                    break;
                }

                default:
                    throw new Error(`Unknown subcommand: ${subcommand}`);
            }

        } catch (error) {
            logger.error('Error in token-settings command', {
                error: error.message,
                stack: error.stack,
                subcommand,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });

            const errorEmbed = createErrorEmbed(
                'Error',
                'An unexpected error occurred while processing your request. Please try again.'
            );

            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (replyError) {
                logger.error('Failed to send error reply in token-settings', {
                    error: replyError.message
                });
            }
        }
    }
};
