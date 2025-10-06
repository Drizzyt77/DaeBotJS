/**
 * Ping Command - Simple Bot Connectivity Test
 *
 * A basic slash command that responds with "Pong!" to verify the bot is responsive.
 * Useful for testing bot connectivity and response time.
 *
 * This command serves multiple purposes:
 * - Quick connectivity test
 * - Response time measurement
 * - Verification that slash commands are working
 * - Simple troubleshooting tool
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Pings the bot to test connectivity and response time'),

    /**
     * Executes the ping command
     * @param {ChatInputCommandInteraction} interaction - The slash command interaction
     */
    async execute(interaction) {
        // Calculate response time
        const sent = await interaction.reply({
            content: '🏓 Pinging...',
            fetchReply: true
        });

        // Calculate the latency between command execution and response
        const roundTripLatency = sent.createdTimestamp - interaction.createdTimestamp;
        const websocketLatency = interaction.client.ws.ping;

        // Update with detailed ping information
        await interaction.editReply({
            content: [
                '🏓 **Pong!**',
                `📊 **Round Trip:** ${roundTripLatency}ms`,
                `🌐 **WebSocket:** ${websocketLatency}ms`,
                `⏰ **Uptime:** ${formatUptime(interaction.client.uptime)}`
            ].join('\n')
        });
    }
};

/**
 * Formats bot uptime into a human-readable string
 * @param {number} uptime - Uptime in milliseconds
 * @returns {string} Formatted uptime string
 */
function formatUptime(uptime) {
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.length > 0 ? parts.join(' ') : '0s';
}