/**
 * Load Best Runs Command
 *
 * Manually loads best runs (and alternate runs) from Raider.IO into the database.
 * This is useful for initial population or backfilling historical data.
 *
 * Fetches:
 * - mythic_plus_best_runs: Best run per dungeon
 * - mythic_plus_alternate_runs: Additional runs per dungeon
 */

const { SlashCommandBuilder } = require('discord.js');
const { RunCollector } = require('../services/run-collector');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('load-best-runs')
        .setDescription('Load best M+ runs from Raider.IO into database (initial population)')
        .addStringOption(option =>
            option.setName('character')
                .setDescription('Character name (leave empty for all config characters)')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const characterName = interaction.options.getString('character');

            logger.info('Manual best runs collection triggered', {
                user: interaction.user.tag,
                guild: interaction.guild?.name,
                character: characterName || 'all'
            });

            const collector = new RunCollector();

            // Show initial status
            await interaction.editReply({
                content: characterName
                    ? `⏳ Loading best M+ runs for **${characterName}** from Raider.IO...`
                    : '⏳ Loading best M+ runs for all characters from Raider.IO...\nThis may take a minute...'
            });

            let summary;
            if (characterName) {
                // Collect for single character
                const result = await collector.collectBestRuns(characterName, {
                    realm: 'thrall',
                    region: 'us'
                });

                summary = {
                    total_characters: 1,
                    successful: result.error ? 0 : 1,
                    failed: result.error ? 1 : 0,
                    total_runs_added: result.runs_added,
                    total_runs_skipped: result.runs_skipped,
                    results: [result]
                };
            } else {
                // Collect for all configured characters
                summary = await collector.collectConfigCharactersBestRuns();
            }

            // Get database stats
            const stats = collector.getStats();

            // Format response
            const response = `
✅ **Best Runs Collection Complete**

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

**Note:** Best runs include the top run per dungeon plus alternate runs. These runs are tagged with your character's current active spec.

${summary.failed > 0 ? '⚠️ Some characters failed to collect. Check logs for details.' : ''}
            `.trim();

            await interaction.editReply({
                content: response
            });

            logger.info('Manual best runs collection complete', summary);

        } catch (error) {
            logger.error('Error in load-best-runs command', {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag
            });

            const errorMessage = '❌ Failed to load best runs. Check logs for details.';

            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
};
