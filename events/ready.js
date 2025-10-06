/**
 * Discord Client Ready Event Handler
 *
 * Triggered when the bot successfully connects to Discord and is ready to respond to events.
 * Handles initial bot setup including status configuration and feature initialization.
 *
 * This event is fired only once during the bot's lifecycle, making it ideal for:
 * - Setting bot status and activity
 * - Initializing background services
 * - Starting periodic tasks
 * - Logging connection success
 */

const wait = require("timers/promises").setTimeout;
const { ActivityType } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: 'clientReady',
    once: true, // This event should only fire once per bot session

    /**
     * Executes when the Discord client is ready
     * @param {Client} client - The Discord.js client instance
     */
    async execute(client) {
        // Wait briefly to ensure full client initialization
        await wait(2000);

        // Log successful connection
        logger.logBotEvent('ready', {
            botTag: client.user.tag,
            botId: client.user.id,
            guildCount: client.guilds.cache.size
        });

        // Set bot activity status
        // This appears in Discord as "Watching for daes 50 alts"
        try {
            await client.user.setActivity('for daes 50 alts', {
                type: ActivityType.Watching
            });
            logger.info('Bot activity status set successfully');
        } catch (error) {
            logger.error('Failed to set bot activity', { error: error.message });
        }

        // Initialize character command auto-refresh system
        // This sets up periodic data updates for active character menus
        try {
            const charactersCommand = require('../commands/characters');
            charactersCommand.initAutoRefresh(client);
            logger.info('Character auto-refresh system initialized');
        } catch (error) {
            logger.error('Failed to initialize auto-refresh system', { error: error.message });
        }

        // Log guild information
        const guildInfo = [];
        client.guilds.cache.forEach(guild => {
            guildInfo.push({
                name: guild.name,
                id: guild.id,
                memberCount: guild.memberCount
            });
        });

        logger.info('Bot initialization complete', {
            guildCount: client.guilds.cache.size,
            guilds: guildInfo
        });
    }
};