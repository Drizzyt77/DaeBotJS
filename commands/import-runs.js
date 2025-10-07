/**
 * Import Runs Command
 *
 * Bulk import historical M+ runs from a JSON file or text input.
 * Useful for adding many old runs at once.
 */

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getDatabase } = require('../database/mythic-runs-db');
const logger = require('../utils/logger');

// Current season
const CURRENT_SEASON = 'season-tww-3';

// Spec to role mapping (same as add-run.js)
const SPEC_ROLES = {
    'Blood': 'TANK', 'Frost': 'DPS', 'Unholy': 'DPS',
    'Havoc': 'DPS', 'Vengeance': 'TANK',
    'Balance': 'DPS', 'Feral': 'DPS', 'Guardian': 'TANK', 'Restoration': 'HEALING',
    'Devastation': 'DPS', 'Preservation': 'HEALING', 'Augmentation': 'DPS',
    'Beast Mastery': 'DPS', 'Marksmanship': 'DPS', 'Survival': 'DPS',
    'Arcane': 'DPS', 'Fire': 'DPS',
    'Brewmaster': 'TANK', 'Windwalker': 'DPS', 'Mistweaver': 'HEALING',
    'Holy': 'HEALING', 'Protection': 'TANK', 'Retribution': 'DPS',
    'Discipline': 'HEALING', 'Shadow': 'DPS',
    'Assassination': 'DPS', 'Outlaw': 'DPS', 'Subtlety': 'DPS',
    'Elemental': 'DPS', 'Enhancement': 'DPS',
    'Affliction': 'DPS', 'Demonology': 'DPS', 'Destruction': 'DPS',
    'Arms': 'DPS', 'Fury': 'DPS'
};

/**
 * Parse date from various formats
 */
function parseDate(dateString) {
    // Try YYYY-MM-DD format
    if (dateString.includes('-')) {
        return new Date(dateString);
    }
    // Try MM/DD/YYYY format
    if (dateString.includes('/')) {
        const [month, day, year] = dateString.split('/');
        return new Date(`${year}-${month}-${day}`);
    }
    throw new Error('Invalid date format');
}

/**
 * Generate example JSON template
 */
function generateExampleJSON() {
    return JSON.stringify([
        {
            character: "Daemourne",
            dungeon: "The Dawnbreaker",
            level: 15,
            spec: "Blood",
            result: "+2",
            date: "2024-12-15"
        },
        {
            character: "Daemourne",
            dungeon: "Ara-Kara, City of Echoes",
            level: 14,
            spec: "Unholy",
            result: "+1",
            date: "2024-12-14",
            score: 285.5
        },
        {
            character: "Daemonk",
            dungeon: "Mists of Tirna Scithe",
            level: 16,
            spec: "Windwalker",
            result: "depleted",
            date: "2024-12-13"
        }
    ], null, 2);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('import-runs')
        .setDescription('Bulk import historical M+ runs from JSON')
        .addSubcommand(subcommand =>
            subcommand
                .setName('file')
                .setDescription('Import runs from a JSON file attachment')
                .addAttachmentOption(option =>
                    option.setName('json')
                        .setDescription('JSON file with runs to import')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('template')
                .setDescription('Generate an example JSON template')
        ),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'template') {
                // Generate template
                const template = generateExampleJSON();
                const buffer = Buffer.from(template, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, { name: 'runs-template.json' });

                const instructions = `
📋 **Run Import Template**

Download the attached JSON file and fill in your runs.

**Format:**
\`\`\`json
{
  "character": "CharacterName",
  "dungeon": "Dungeon Name",
  "level": 15,
  "spec": "Spec Name",
  "result": "+1", "+2", "+3", or "depleted",
  "date": "YYYY-MM-DD",
  "score": 280.5 (optional)
}
\`\`\`

**Valid Dungeons:**
• Ara-Kara, City of Echoes
• Eco-Dome Al'dani
• Halls of Atonement
• The Dawnbreaker
• Priory of the Sacred Flame
• Operation: Floodgate
• Tazavesh: So'leah's Gambit
• Tazavesh: Streets of Wonder

**After editing:** Use \`/import-runs file\` and attach your JSON file.
                `.trim();

                await interaction.reply({
                    content: instructions,
                    files: [attachment],
                    ephemeral: true
                });
                return;
            }

            // Import from file
            await interaction.deferReply({ ephemeral: true });

            const attachment = interaction.options.getAttachment('json');

            if (!attachment.name.endsWith('.json')) {
                await interaction.editReply({
                    content: '❌ File must be a .json file. Use `/import-runs template` to get an example.'
                });
                return;
            }

            // Fetch file content
            const response2 = await fetch(attachment.url);
            const jsonText = await response2.text();

            let runs;
            try {
                runs = JSON.parse(jsonText);
            } catch (error) {
                await interaction.editReply({
                    content: '❌ Invalid JSON format. Please check your file and try again.'
                });
                return;
            }

            if (!Array.isArray(runs)) {
                await interaction.editReply({
                    content: '❌ JSON must be an array of runs. Use `/import-runs template` to get the correct format.'
                });
                return;
            }

            await interaction.editReply({
                content: `⏳ Importing ${runs.length} runs...`
            });

            logger.info('Bulk run import started', {
                user: interaction.user.tag,
                runCount: runs.length
            });

            const db = getDatabase();
            const results = {
                total: runs.length,
                added: 0,
                skipped: 0,
                errors: []
            };

            // Import each run
            for (let i = 0; i < runs.length; i++) {
                const run = runs[i];

                try {
                    // Validate required fields
                    if (!run.character || !run.dungeon || !run.level || !run.spec || !run.result || !run.date) {
                        results.errors.push(`Run ${i + 1}: Missing required fields`);
                        continue;
                    }

                    // Parse date
                    const completedDate = parseDate(run.date);
                    if (isNaN(completedDate.getTime())) {
                        results.errors.push(`Run ${i + 1}: Invalid date format`);
                        continue;
                    }

                    // Get spec role
                    const specRole = SPEC_ROLES[run.spec] || 'DPS';

                    // Parse result
                    const isTimed = run.result !== 'depleted';
                    const numUpgrades = run.result === '+3' ? 3 : run.result === '+2' ? 2 : run.result === '+1' ? 1 : 0;

                    // Calculate score if not provided
                    const calculatedScore = run.score || (run.level * 10 * (isTimed ? 1.5 : 1.0));

                    // Upsert character
                    const characterId = db.upsertCharacter({
                        name: run.character,
                        realm: run.realm || 'thrall',
                        region: run.region || 'us',
                        class: 'Unknown',
                        active_spec_name: run.spec,
                        active_spec_role: specRole
                    });

                    // Create run data
                    const runData = {
                        dungeon: run.dungeon,
                        mythic_level: run.level,
                        completed_timestamp: completedDate.getTime(),
                        duration: run.duration || 0,
                        keystone_run_id: null,
                        is_completed_within_time: isTimed,
                        score: calculatedScore,
                        num_keystone_upgrades: numUpgrades,
                        spec_name: run.spec,
                        spec_role: specRole,
                        affixes: run.affixes || [],
                        season: run.season || CURRENT_SEASON
                    };

                    // Insert run
                    const insertResult = db.insertRun(characterId, runData);

                    if (insertResult.inserted) {
                        results.added++;
                    } else {
                        results.skipped++;
                    }

                } catch (error) {
                    results.errors.push(`Run ${i + 1}: ${error.message}`);
                }
            }

            // Generate response
            const response = `
✅ **Run Import Complete**

**Summary:**
• Total Runs: ${results.total}
• Successfully Added: ${results.added}
• Duplicates Skipped: ${results.skipped}
• Errors: ${results.errors.length}

${results.errors.length > 0 ? `\n**Errors:**\n${results.errors.slice(0, 10).map(e => `• ${e}`).join('\n')}${results.errors.length > 10 ? `\n• ...and ${results.errors.length - 10} more` : ''}` : ''}

The runs have been added to the database and will appear in spec-filtered views.
            `.trim();

            await interaction.editReply({ content: response });

            logger.info('Bulk run import complete', {
                user: interaction.user.tag,
                ...results
            });

        } catch (error) {
            logger.error('Error in import-runs command', {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag
            });

            const errorMessage = `❌ Failed to import runs: ${error.message}`;

            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
};
