/**
 * Add Run Command
 *
 * Manually add a historical M+ run to the database.
 * Useful for runs that are too old to be fetched from the API.
 */

const { SlashCommandBuilder } = require('discord.js');
const { getDatabase } = require('../database/mythic-runs-db');
const { getConfigService } = require('../services/config-service');
const logger = require('../utils/logger');

// Get dungeons and season from config service
// Note: This is loaded at bot startup. To update dungeons, you must redeploy commands after changing settings
const configService = getConfigService();
const CURRENT_SEASON = configService.getCurrentSeasonName();
const DUNGEONS = configService.getActiveDungeons();

// Spec to role mapping
const SPEC_ROLES = {
    // Death Knight
    'Blood': 'TANK',
    'Frost': 'DPS',
    'Unholy': 'DPS',
    // Demon Hunter
    'Havoc': 'DPS',
    'Vengeance': 'TANK',
    // Druid
    'Balance': 'DPS',
    'Feral': 'DPS',
    'Guardian': 'TANK',
    'Restoration': 'HEALING',
    // Evoker
    'Devastation': 'DPS',
    'Preservation': 'HEALING',
    'Augmentation': 'DPS',
    // Hunter
    'Beast Mastery': 'DPS',
    'Marksmanship': 'DPS',
    'Survival': 'DPS',
    // Mage
    'Arcane': 'DPS',
    'Fire': 'DPS',
    // Monk
    'Brewmaster': 'TANK',
    'Windwalker': 'DPS',
    'Mistweaver': 'HEALING',
    // Paladin
    'Holy': 'HEALING',
    'Protection': 'TANK',
    'Retribution': 'DPS',
    // Priest
    'Discipline': 'HEALING',
    'Shadow': 'DPS',
    // Rogue
    'Assassination': 'DPS',
    'Outlaw': 'DPS',
    'Subtlety': 'DPS',
    // Shaman
    'Elemental': 'DPS',
    'Enhancement': 'DPS',
    // Warlock
    'Affliction': 'DPS',
    'Demonology': 'DPS',
    'Destruction': 'DPS',
    // Warrior
    'Arms': 'DPS',
    'Fury': 'DPS'
};

// Add Frost mage and Shaman Restoration
SPEC_ROLES['Frost'] = 'DPS'; // Mage Frost (overrides DK Frost which is already set)
SPEC_ROLES['Restoration'] = 'HEALING'; // Shaman/Druid Restoration

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-run')
        .setDescription('Manually add a historical M+ run to the database')
        .addStringOption(option =>
            option.setName('character')
                .setDescription('Character name')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('dungeon')
                .setDescription('Dungeon name')
                .setRequired(true)
                .addChoices(
                    ...DUNGEONS.map(dungeon => ({ name: dungeon, value: dungeon }))
                )
        )
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Keystone level (e.g., 10, 15, 20)')
                .setRequired(true)
                .setMinValue(2)
                .setMaxValue(40)
        )
        .addStringOption(option =>
            option.setName('spec')
                .setDescription('Specialization used for this run')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName('result')
                .setDescription('Was the key timed?')
                .setRequired(true)
                .addChoices(
                    { name: 'Timed (+1)', value: '+1' },
                    { name: 'Timed (+2)', value: '+2' },
                    { name: 'Timed (+3)', value: '+3' },
                    { name: 'Depleted', value: 'depleted' }
                )
        )
        .addStringOption(option =>
            option.setName('date')
                .setDescription('Date completed (YYYY-MM-DD or MM/DD/YYYY)')
                .setRequired(true)
        )
        .addNumberOption(option =>
            option.setName('score')
                .setDescription('Run score')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('season')
                .setDescription('Season (default: current season)')
                .setRequired(false)
        ),
        
        async autocomplete(interaction) {
        if (interaction.commandName !== 'add-run') return;

        try {
            const focusedValue = interaction.options.getFocused().toLowerCase();

            const specs = Object.keys(SPEC_ROLES);

            const filtered = specs
                .filter(character => character.toLowerCase().includes(focusedValue))
                .slice(0, 25); // Discord limit

            await interaction.respond(
                filtered.map(spec => ({
                    name: spec,
                    value: spec
                }))
            );
        } catch (error) {
            logger.error('Error in manage-characters autocomplete', { error: error.message });
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const characterName = interaction.options.getString('character');
            const dungeon = interaction.options.getString('dungeon');
            const mythicLevel = interaction.options.getInteger('level');
            const specName = interaction.options.getString('spec');
            const result = interaction.options.getString('result');
            const dateString = interaction.options.getString('date');
            const score = interaction.options.getNumber('score');
            const season = interaction.options.getString('season') || CURRENT_SEASON;

            logger.info('Manual run addition requested', {
                user: interaction.user.tag,
                character: characterName,
                dungeon,
                level: mythicLevel,
                spec: specName
            });

            // Parse date
            let completedDate;
            try {
                // Try YYYY-MM-DD format
                if (dateString.includes('-')) {
                    completedDate = new Date(dateString);
                }
                // Try MM/DD/YYYY format
                else if (dateString.includes('/')) {
                    const [month, day, year] = dateString.split('/');
                    completedDate = new Date(`${year}-${month}-${day}`);
                } else {
                    throw new Error('Invalid date format');
                }

                if (isNaN(completedDate.getTime())) {
                    throw new Error('Invalid date');
                }
            } catch (error) {
                await interaction.editReply({
                    content: '❌ Invalid date format. Please use YYYY-MM-DD (e.g., 2025-01-15) or MM/DD/YYYY (e.g., 01/15/2025)'
                });
                return;
            }

            // Get spec role
            const specRole = SPEC_ROLES[specName] || 'DPS';

            // Parse result
            const isTimed = result !== 'depleted';
            const numUpgrades = result === '+3' ? 3 : result === '+2' ? 2 : result === '+1' ? 1 : 0;

            // Calculate score if not provided (rough estimate)
            const calculatedScore = score || (mythicLevel * 10 * (isTimed ? 1.5 : 1.0));

            // Get database
            const db = getDatabase();

            // Find or create character
            const characterId = db.upsertCharacter({
                name: characterName,
                realm: 'thrall',
                region: 'us',
                class: 'Unknown', // We don't have this info
                active_spec_name: specName,
                active_spec_role: specRole
            });

            // Create run data
            const runData = {
                dungeon,
                mythic_level: mythicLevel,
                completed_timestamp: completedDate.getTime(),
                duration: 0, // Unknown
                keystone_run_id: null, // No Raider.IO ID for manual entries
                is_completed_within_time: isTimed,
                score: calculatedScore,
                num_keystone_upgrades: numUpgrades,
                spec_name: specName,
                spec_role: specRole,
                affixes: [], // Unknown
                season
            };

            // Insert run
            const insertResult = db.insertRun(characterId, runData);

            if (insertResult.inserted) {
                const response = `
✅ **Run Added Successfully**

**Character:** ${characterName}
**Dungeon:** ${dungeon}
**Level:** +${mythicLevel}
**Spec:** ${specName} (${specRole})
**Result:** ${result === 'depleted' ? 'Depleted' : `Timed (${result})`}
**Score:** ${calculatedScore.toFixed(1)}
**Date:** ${completedDate.toLocaleDateString()}
**Season:** ${season}

The run has been added to the database and will appear in spec-filtered views.
                `.trim();

                await interaction.editReply({ content: response });

                logger.info('Manual run added successfully', {
                    user: interaction.user.tag,
                    character: characterName,
                    dungeon,
                    level: mythicLevel,
                    spec: specName,
                    runId: insertResult.id
                });
            } else {
                await interaction.editReply({
                    content: '⚠️ This run already exists in the database (duplicate detected).'
                });
            }

        } catch (error) {
            logger.error('Error in add-run command', {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag
            });

            const errorMessage = `❌ Failed to add run: ${error.message}`;

            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
};
