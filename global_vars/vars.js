/**
 * Discord Client Configuration and Global Variables
 *
 * This module creates and configures the main Discord.js client instance with the required
 * gateway intents for the bot's functionality. The client is exported as a singleton to
 * ensure consistent access across the application.
 *
 * Gateway Intents Explained:
 * - Guilds: Access basic guild information
 * - GuildMessages: Read messages in guilds
 * - GuildMembers: Access member information (requires privileged intent)
 * - MessageContent: Read message content (requires privileged intent)
 * - GuildBans: Monitor ban events
 * - GuildIntegrations: Track integration changes
 * - GuildPresences: Monitor member presence updates (requires privileged intent)
 * - GuildInvites: Track invite creation/deletion
 *
 * Note: Some intents require approval from Discord for bots in 100+ servers.
 */

const { GatewayIntentBits, Client } = require('discord.js');

/**
 * Create Discord client with required intents for WoW guild management
 * The client is configured with comprehensive intents to support:
 * - Command execution and interaction handling
 * - Member data access for character association
 * - Message content reading for potential chat features
 * - Guild management capabilities
 */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // Basic guild access (required)
        GatewayIntentBits.GuildMessages,    // Read guild messages
        GatewayIntentBits.GuildMembers,     // Access member list (privileged)
        GatewayIntentBits.MessageContent,   // Read message content (privileged)
        GatewayIntentBits.GuildBans,        // Monitor ban events
        GatewayIntentBits.GuildIntegrations, // Track integrations
        GatewayIntentBits.GuildPresences,   // Member presence updates (privileged)
        GatewayIntentBits.GuildInvites      // Track invites
    ],

    // Optional client options for better performance and behavior
    allowedMentions: {
        parse: ['users', 'roles'],  // Allow mentioning users and roles
        repliedUser: false          // Don't ping users when replying
    },

    // Presence configuration (can be overridden in ready event)
    presence: {
        status: 'online',
        activities: [{
            name: 'World of Warcraft',
            type: 'PLAYING'
        }]
    }
});

// Export the configured client for use throughout the application
module.exports = {
    client
};