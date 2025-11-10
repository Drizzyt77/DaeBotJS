/**
 * WoW Token Price Tracking Service
 *
 * Monitors WoW token prices from wowtoken.app API and sends notifications
 * when the price exceeds the configured threshold.
 *
 * Features:
 * - Fetches US token prices every 20 minutes (aligned to hour)
 * - Tracks price changes and sends notifications
 * - Supports both channel notifications and user DMs
 * - Stores price history in database
 */

const fs = require('fs');
const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { getTokenDatabase } = require('../database/token-db');
const { getConfigPath } = require('../utils/app-paths');

// Token API configuration
const TOKEN_API_URL = 'https://data.wowtoken.app/v2/current/retail.json';
const CHECK_INTERVAL = 20 * 60 * 1000; // 20 minutes in milliseconds

/**
 * TokenTracker class
 * Manages token price monitoring and notifications
 */
class TokenTracker {
    constructor(client) {
        this.client = client;
        this.db = getTokenDatabase();
        this.intervalId = null;
        this.isRunning = false;
    }

    /**
     * Start the token price tracking service
     * Schedules checks every 20 minutes aligned to the hour
     */
    start() {
        if (this.isRunning) {
            logger.warn('Token tracker is already running');
            return;
        }

        logger.info('Starting WoW token price tracker');

        // Calculate delay until next 20-minute mark (0, 20, 40 minutes past the hour)
        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const milliseconds = now.getMilliseconds();

        // Calculate next check time (0, 20, or 40 minutes)
        let nextCheckMinute = 0;
        if (minutes < 20) {
            nextCheckMinute = 20;
        } else if (minutes < 40) {
            nextCheckMinute = 40;
        } else {
            nextCheckMinute = 60; // Next hour
        }

        // Calculate delay in milliseconds
        const minutesUntilNext = nextCheckMinute - minutes;
        const initialDelay = (minutesUntilNext * 60 * 1000) - (seconds * 1000) - milliseconds;

        logger.info('Token tracker scheduled', {
            currentTime: now.toISOString(),
            nextCheck: new Date(Date.now() + initialDelay).toISOString(),
            delaySeconds: (initialDelay / 1000).toFixed(2)
        });

        // Schedule first check
        setTimeout(() => {
            this.checkPrice();

            // Schedule recurring checks every 20 minutes
            this.intervalId = setInterval(() => {
                this.checkPrice();
            }, CHECK_INTERVAL);

        }, initialDelay);

        this.isRunning = true;
    }

    /**
     * Stop the token price tracking service
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.isRunning = false;
            logger.info('Token tracker stopped');
        }
    }

    /**
     * Fetch current token price from API
     * @returns {Promise<Object|null>} Token data or null on failure
     */
    async fetchTokenPrice() {
        try {
            const response = await fetch(TOKEN_API_URL);

            if (!response.ok) {
                throw new Error(`API returned status ${response.status}`);
            }

            const data = await response.json();

            // Extract US price data
            if (!data.us || !Array.isArray(data.us) || data.us.length < 2) {
                throw new Error('Invalid API response format');
            }

            const [timestamp, price] = data.us;

            logger.info('Fetched token price', {
                price,
                timestamp,
                priceFormatted: this.formatGold(price)
            });

            return { price, timestamp };

        } catch (error) {
            logger.error('Failed to fetch token price', {
                error: error.message,
                url: TOKEN_API_URL
            });
            return null;
        }
    }

    /**
     * Check token price and send notifications if needed
     */
    async checkPrice() {
        try {
            logger.info('Checking token price');

            // Fetch current price
            const tokenData = await this.fetchTokenPrice();
            if (!tokenData) {
                logger.warn('Skipping price check due to API failure');
                return;
            }

            const { price, timestamp } = tokenData;

            // Get previous price
            const previousPrice = this.db.getLatestPrice();

            // Store new price
            const inserted = this.db.insertPrice(price, timestamp);
            if (!inserted) {
                logger.info('Price already recorded, skipping duplicate');
                return;
            }

            // Check if we should send notifications
            const threshold = this.db.getThreshold();

            logger.info('Price check complete', {
                currentPrice: price,
                previousPrice: previousPrice?.price || 'none',
                threshold,
                aboveThreshold: price >= threshold
            });

            // Only send notifications if:
            // 1. Price is at or above threshold
            // 2. Price has crossed a 5k boundary (315k, 320k, 325k, etc.)
            const BRACKET_SIZE = 5000;

            // Calculate which 5k bracket each price falls into
            const currentBracket = Math.floor(price / BRACKET_SIZE);
            const previousBracket = previousPrice ? Math.floor(previousPrice.price / BRACKET_SIZE) : null;

            // Only notify if we've crossed into a different 5k bracket
            const hasCrossedBracket = !previousPrice || currentBracket !== previousBracket;

            const shouldNotify = price >= threshold && hasCrossedBracket;

            if (shouldNotify) {
                logger.info('Sending token price notifications', {
                    price,
                    threshold,
                    priceChange: previousPrice ? price - previousPrice.price : 0,
                    currentBracket: currentBracket * BRACKET_SIZE,
                    previousBracket: previousBracket ? previousBracket * BRACKET_SIZE : 'none'
                });

                await this.sendNotifications(price, previousPrice?.price || null, threshold);
            } else {
                if (price < threshold) {
                    logger.info('Price below threshold, no notification sent', {
                        price,
                        threshold
                    });
                } else if (previousPrice && !hasCrossedBracket) {
                    logger.info('Price has not crossed 5k bracket, no notification sent', {
                        price,
                        previousPrice: previousPrice.price,
                        change: price - previousPrice.price,
                        bracket: currentBracket * BRACKET_SIZE
                    });
                } else {
                    logger.info('Price unchanged, no notification sent');
                }
            }

        } catch (error) {
            logger.error('Error during token price check', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Send notifications to channel and users
     * @param {number} currentPrice - Current token price
     * @param {number|null} previousPrice - Previous token price
     * @param {number} threshold - Current threshold
     */
    async sendNotifications(currentPrice, previousPrice, threshold) {
        const embed = this.createPriceEmbed(currentPrice, previousPrice, threshold);

        // Send to configured channel
        await this.sendChannelNotification(embed);

        // Send DMs to opted-in users
        await this.sendUserDMs(embed);
    }

    /**
     * Create embed for price notification
     * @param {number} currentPrice - Current token price
     * @param {number|null} previousPrice - Previous token price
     * @param {number} threshold - Current threshold
     * @returns {EmbedBuilder} Discord embed
     */
    createPriceEmbed(currentPrice, previousPrice, threshold) {
        const priceChange = previousPrice ? currentPrice - previousPrice : 0;
        const changePercent = previousPrice ? ((priceChange / previousPrice) * 100).toFixed(2) : 0;

        const embed = new EmbedBuilder()
            .setTitle('🪙 WoW Token Price Alert')
            .setColor(priceChange > 0 ? 0x00FF00 : priceChange < 0 ? 0xFF0000 : 0xFFD700)
            .setTimestamp();

        // Current price
        embed.addFields({
            name: '💰 Current Price',
            value: `**${this.formatGold(currentPrice)}**`,
            inline: true
        });

        // Threshold
        embed.addFields({
            name: '🎯 Threshold',
            value: this.formatGold(threshold),
            inline: true
        });

        // Price change
        if (previousPrice) {
            const changeEmoji = priceChange > 0 ? '📈' : priceChange < 0 ? '📉' : '➡️';
            const changeText = priceChange > 0 ? `+${this.formatGold(priceChange)}` : this.formatGold(priceChange);

            embed.addFields({
                name: `${changeEmoji} Change`,
                value: `${changeText} (${changePercent}%)`,
                inline: true
            });
        }

        // Add description
        const description = priceChange > 0
            ? '✅ Token price has increased!'
            : priceChange < 0
                ? '⚠️ Token price has decreased!'
                : 'ℹ️ Token price remains above threshold.';

        embed.setDescription(description);

        return embed;
    }

    /**
     * Send notification to configured Discord channel
     * @param {EmbedBuilder} embed - Notification embed
     */
    async sendChannelNotification(embed) {
        try {
            const configPath = getConfigPath();
            const configContent = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configContent);

            if (!config.tokenChannel) {
                logger.warn('No tokenChannel configured, skipping channel notification');
                return;
            }

            const channel = await this.client.channels.fetch(config.tokenChannel);

            if (!channel) {
                logger.error('Could not find token notification channel', {
                    channelId: config.tokenChannel
                });
                return;
            }

            await channel.send({ embeds: [embed] });

            logger.info('Sent token price notification to channel', {
                channelId: config.tokenChannel
            });

        } catch (error) {
            logger.error('Failed to send channel notification', {
                error: error.message
            });
        }
    }

    /**
     * Send DM notifications to opted-in users
     * @param {EmbedBuilder} embed - Notification embed
     */
    async sendUserDMs(embed) {
        try {
            const userIds = this.db.getUsersWithDMEnabled();

            if (userIds.length === 0) {
                logger.info('No users opted in for token DMs');
                return;
            }

            logger.info('Sending token DMs to users', {
                userCount: userIds.length
            });

            let successCount = 0;
            let failCount = 0;

            for (const userId of userIds) {
                try {
                    const user = await this.client.users.fetch(userId);
                    await user.send({ embeds: [embed] });
                    successCount++;

                    logger.debug('Sent token DM to user', { userId });

                } catch (error) {
                    failCount++;
                    logger.warn('Failed to send token DM to user', {
                        userId,
                        error: error.message
                    });
                }
            }

            logger.info('Token DM batch complete', {
                total: userIds.length,
                success: successCount,
                failed: failCount
            });

        } catch (error) {
            logger.error('Failed to send user DMs', {
                error: error.message
            });
        }
    }

    /**
     * Format gold amount with proper separators
     * @param {number} gold - Gold amount
     * @returns {string} Formatted gold string
     */
    formatGold(gold) {
        return `${gold.toLocaleString()}g`;
    }

    /**
     * Get tracker statistics
     * @returns {Object} Tracker stats
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            ...this.db.getStats()
        };
    }

    /**
     * Manually trigger a price check (for testing)
     * @returns {Promise<void>}
     */
    async manualCheck() {
        logger.info('Manual token price check triggered');
        await this.checkPrice();
    }
}

module.exports = { TokenTracker };
