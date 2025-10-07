/**
 * Collect Runs Command
 *
 * Manual command to trigger collection of M+ runs from Raider.IO into the local database.
 * Useful for initial data population and manual updates.
 */

const { SlashCommandBuilder } = require('discord.js');
const { RunCollector } = require('../services/run-collector');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('collect-runs')
        .setDescription('Collect M+ runs from Raider.IO into local database')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of runs to collect')
                .setRequired(false)
                .addChoices(
                    { name: 'Recent Runs (last ~500)', value: 'recent' },
                    { name: 'Best Runs (top per dungeon)', value: 'best' }
                )
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const runType = interaction.options.getString('type') || 'recent';

            logger.info('Manual run collection triggered', {
                user: interaction.user.tag,
                guild: interaction.guild?.name,
                runType
            });

            const collector = new RunCollector();

            // Show initial status
            const statusMessage = runType === 'best'
                ? '⏳ Collecting best M+ runs from Raider.IO...'
                : '⏳ Collecting recent M+ runs from Raider.IO...';

            await interaction.editReply({
                content: statusMessage
            });

            // Collect runs from all configured characters
            const summary = runType === 'best'
                ? await collector.collectConfigCharactersBestRuns()
                : await collector.collectConfigCharacters();

            // Get database stats
            const stats = collector.getStats();

            // Format response
            const runTypeLabel = runType === 'best' ? 'Best Runs' : 'Recent Runs';
            const response = `
✅ **Run Collection Complete** (${runTypeLabel})

**Summary:**
• Characters Processed: ${summary.total_characters}
• Successful: ${summary.successful}
• Failed: ${summary.failed}
• New Runs Added: ${summary.total_runs_added}
• Duplicate Runs Skipped: ${summary.total_runs_skipped}

**Database Stats:**
• Total Characters: ${stats.characters}
• Total Runs Stored: ${stats.runs}
• Database Size: ${(stats.db_size / 1024 / 1024).toFixed(2)} MB
${stats.latest_run ? `• Latest Run: <t:${Math.floor(stats.latest_run / 1000)}:R>` : ''}

${runType === 'best' ? '**Note:** Best runs include top runs per dungeon plus alternates.\n' : ''}${summary.failed > 0 ? '⚠️ Some characters failed to collect. Check logs for details.' : ''}
            `.trim();

            await interaction.editReply({
                content: response
            });

            logger.info('Manual run collection complete', summary);

        } catch (error) {
            logger.error('Error in collect-runs command', {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag
            });

            const errorMessage = '❌ Failed to collect runs. Check logs for details.';

            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
};
