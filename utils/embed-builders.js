/**
 * Discord Embed Builders Utility
 * Provides functions for creating formatted Discord embeds for different character data views
 * Handles all embed creation with consistent styling and formatting
 */

const { EmbedBuilder } = require('discord.js');
const { formatCharacterSummary, formatDetailedRuns, groupCharactersByRole, formatRaidDisplayName, findMostRelevantRaid, ROLE_ICONS, getClassIcon, getRoleIcon, getTimedSymbol } = require('./data-formatters');
const logger = require('./logger');

/**
 * Color scheme for different embed types
 */
const EMBED_COLORS = {
    MAIN_SUMMARY: 0x0099FF,      // Blue for main character summary
    CHARACTER_DETAIL: 0x00FF00,   // Green for individual character details
    DUNGEON_COMPARISON: 0xFF6600, // Orange for dungeon comparisons
    RAID_PROGRESSION: 0x8B0000,   // Dark red for raid progression
    WEEKLY_MPLUS: 0x4CAF50,       // Light green for weekly M+ stats
    ERROR: 0xFF0000,              // Red for error states
    NO_DATA: 0xFF6600             // Orange for no data states
};

/**
 * Creates the main character summary embed
 * @param {Array} characters - Array of character objects
 * @param {Object} cacheInfo - Cache timing information
 * @returns {EmbedBuilder} Discord embed for main character summary
 */
function createMainSummaryEmbed(characters, cacheInfo = null) {
    const embed = new EmbedBuilder()
        .setTitle('Character Summary')
        .setColor(EMBED_COLORS.MAIN_SUMMARY)
        .setTimestamp();

    // Add cache status information if available
    if (cacheInfo && cacheInfo.cacheTimestamp && cacheInfo.nextRefreshTimestamp) {
        embed.setDescription(
            `📊 Data cached <t:${cacheInfo.cacheTimestamp}:R>\n🔄 Auto-refresh <t:${cacheInfo.nextRefreshTimestamp}:R>`
        );
    }

    // Sort characters by total M+ score (highest first)
    const sortedCharacters = [...characters].sort((a, b) => {
        const aTotal = (a.mythic_plus_runs || []).reduce((sum, run) => sum + (run.score || 0), 0);
        const bTotal = (b.mythic_plus_runs || []).reduce((sum, run) => sum + (run.score || 0), 0);
        return bTotal - aTotal;
    });

    // Add character fields
    sortedCharacters.forEach(character => {
        const summary = formatCharacterSummary(character);
        embed.addFields({
            name: summary.name,
            value: summary.value,
            inline: true
        });
    });

    return embed;
}

/**
 * Creates a detailed character view embed with gear information
 * @param {Object} character - Character object with runs data
 * @param {Object} gearData - Character gear information
 * @param {Object} linksData - Character external links
 * @returns {EmbedBuilder} Discord embed for character details
 */
function createCharacterDetailEmbed(character, gearData = null, linksData = null) {
    const embed = new EmbedBuilder()
        .setTitle(`${character.name} - Detailed Runs`)
        .setColor(EMBED_COLORS.CHARACTER_DETAIL)
        .setTimestamp();

    // Add character portrait if available
    if (gearData && gearData.thumbnail_url) {
        embed.setThumbnail(gearData.thumbnail_url);
    }

    // Add detailed runs description
    const runsDescription = formatDetailedRuns(character.mythic_plus_runs || []);
    embed.setDescription(runsDescription);

    // Add summary statistics
    const runs = character.mythic_plus_runs || [];
    if (runs.length > 0) {
        const highestRun = runs.reduce((prev, current) =>
            (current.score || 0) > (prev.score || 0) ? current : prev
        );
        const totalScore = runs.reduce((sum, run) => sum + (run.score || 0), 0);

        let summaryValue = `Highest Key: **${highestRun.mythic_level}+**\nTotal Score: **${totalScore.toFixed(1)}**`;

        // Add gear information if available
        if (gearData) {
            const gearSlots = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'mainhand'];
            const itemLevels = gearSlots
                .filter(slot => gearData.items && gearData.items[slot])
                .map(slot => gearData.items[slot].item_level);

            const averageItemLevel = itemLevels.length > 0
                ? (itemLevels.reduce((sum, level) => sum + level, 0) / itemLevels.length).toFixed(1)
                : 0;

            summaryValue += `\nEquipped iLvl: **${gearData.item_level}**\nAverage iLvl: **${averageItemLevel}**`;
        }

        embed.addFields({
            name: 'Summary',
            value: summaryValue,
            inline: false
        });
    }

    // Add character links if available
    if (linksData) {
        embed.addFields({
            name: 'Character Links',
            value: `[RaiderIO](${linksData.raiderIoLink})\n[WarcraftLogs](${linksData.warcraftlogsLink})`,
            inline: false
        });
    }

    // Add gear details if available
    if (gearData && gearData.items) {
        addGearFieldsToEmbed(embed, gearData);
    }

    return embed;
}

/**
 * Adds tier gear information fields to an embed
 * Shows only tier-relevant pieces organized into two fields
 * @param {EmbedBuilder} embed - Embed to add gear fields to
 * @param {Object} gearData - Character gear data
 */
function addGearFieldsToEmbed(embed, gearData) {
    // Define the specific gear slots we want to display
    const primaryTierSlots = ['head', 'chest', 'legs'];    // First field
    const secondaryTierSlots = ['shoulder', 'hands'];      // Second field

    /**
     * Formats a single gear piece for display
     * @param {string} slot - Gear slot name
     * @param {Object} item - Item data
     * @returns {string} Formatted gear piece string
     */
    function formatGearPiece(slot, item) {
        const slotName = slot.charAt(0).toUpperCase() + slot.slice(1);
        const itemLink = `[${item.name}](https://www.wowhead.com/item=${item.item_id})`;

        // Determine tier status
        const hasTier = item.tier !== null && item.tier !== undefined;

        return `**${slotName}**: ${itemLink}\nItem Level: ${item.item_level}\nTier: ${hasTier}`;
    }

    /**
     * Creates formatted gear field content for specified slots
     * @param {Array} slots - Array of slot names to display
     * @returns {string} Formatted field content or null if no items found
     */
    function createGearFieldContent(slots) {
        const gearPieces = slots
            .filter(slot => gearData.items && gearData.items[slot])
            .map(slot => formatGearPiece(slot, gearData.items[slot]));

        return gearPieces.length > 0 ? gearPieces.join('\n\n') : null;
    }

    // Add primary tier pieces field (Head, Chest, Legs)
    const primaryContent = createGearFieldContent(primaryTierSlots);
    if (primaryContent) {
        embed.addFields({
            name: '🛡️ Primary Tier Pieces',
            value: primaryContent,
            inline: true
        });
    }

    // Add secondary tier pieces field (Shoulders, Hands)
    const secondaryContent = createGearFieldContent(secondaryTierSlots);
    if (secondaryContent) {
        embed.addFields({
            name: '⚔️ Secondary Tier Pieces',
            value: secondaryContent,
            inline: true
        });
    }

    // If we have both fields, add an empty field to ensure proper layout
    if (primaryContent && secondaryContent) {
        embed.addFields({
            name: '\u200b',
            value: '\u200b',
            inline: true
        });
    }
}

/**
 * Check if a character has completed a +12 or higher this week
 * @param {string} characterName - Character name
 * @param {string} realm - Character realm
 * @param {string} region - Character region
 * @returns {boolean} True if completed +12 or higher this week
 */
function hasWeeklyCompletion(characterName, realm = null, region = null) {
    try {
        const { getDatabase } = require('../database/mythic-runs-db');
        const { getConfigService } = require('../services/config-service');
        const config = getConfigService();
        realm = realm || config.getDefaultRealm();
        region = region || config.getDefaultRegion();
        const db = getDatabase();

        // Calculate start of this week (Tuesday reset)
        const now = new Date();
        const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 2 = Tuesday
        const hourOfDay = now.getUTCHours();

        // Calculate days since last Tuesday 15:00 UTC
        let daysSinceReset;
        if (dayOfWeek < 2 || (dayOfWeek === 2 && hourOfDay < 15)) {
            // Before Tuesday reset this week, go back to last Tuesday
            daysSinceReset = dayOfWeek + 7 - 2;
        } else {
            // After Tuesday reset, days since this Tuesday
            daysSinceReset = dayOfWeek - 2;
        }

        const weekStart = new Date(now);
        weekStart.setUTCDate(now.getUTCDate() - daysSinceReset);
        weekStart.setUTCHours(15, 0, 0, 0); // Tuesday 15:00 UTC

        const weekStartTimestamp = weekStart.getTime();

        // Query for any +12 or higher runs this week
        const runs = db.getRunsBySpec(characterName, null, {
            realm,
            region,
            minLevel: 12,
            limit: 1 // We only need to know if one exists
        });

        // Check if any run was completed after week start
        return runs.some(run => run.completed_timestamp >= weekStartTimestamp);

    } catch (error) {
        // If there's an error, just return false (don't show checkmark)
        return false;
    }
}

/**
 * Creates a dungeon comparison embed showing all characters' performance in a specific dungeon
 * @param {string} dungeonName - Name of the dungeon
 * @param {Array} characters - Array of character objects
 * @returns {EmbedBuilder} Discord embed for dungeon comparison
 */
function createDungeonComparisonEmbed(dungeonName, characters) {
    const embed = new EmbedBuilder()
        .setTitle(`${dungeonName} - Character Comparison`)
        .setColor(EMBED_COLORS.DUNGEON_COMPARISON)
        .setTimestamp();

    // Collect character performance data for this dungeon
    const characterRuns = characters.map(character => {
        const dungeonRun = (character.mythic_plus_runs || []).find(run => run.dungeon === dungeonName);

        // Check for weekly completion (+12 or higher)
        const weeklyComplete = hasWeeklyCompletion(
            character.name,
            character.realm || 'Thrall',
            character.region || 'us'
        );

        return {
            name: character.name,
            class: character.class,
            level: dungeonRun ? dungeonRun.mythic_level : 0,
            score: dungeonRun ? dungeonRun.score : 0,
            timed: dungeonRun ? dungeonRun.timed : 0,
            role: character.role || 'DPS',
            weeklyComplete,
            realm: character.realm,
            region: character.region
        };
    });

    if (characterRuns.length === 0) {
        embed.setDescription(`No characters have completed ${dungeonName}`);
        return embed;
    }

    // Group by role and sort by performance
    const roleGroups = groupCharactersByRole(characterRuns);

    Object.keys(roleGroups).forEach(role => {
        roleGroups[role].sort((a, b) => (b.score || 0) - (a.score || 0));
    });

    // Add role sections to embed
    Object.keys(roleGroups).forEach(role => {
        if (roleGroups[role].length > 0) {
            const roleData = roleGroups[role]
                .map(run => {
                    const timedSymbol = getTimedSymbol(run.timed);
                    const classIcon = getClassIcon(run.class);
                    const weeklyCheck = run.weeklyComplete ? ' ✅' : '';
                    return `${classIcon} **${run.name}**${weeklyCheck}\n${run.level}${timedSymbol} | Score: ${run.score}`;
                })
                .join('\n\n');

            embed.addFields({
                name: `${ROLE_ICONS[role]} ${role}`,
                value: roleData,
                inline: true
            });
        }
    });

    // Add summary statistics
    const completedRuns = characterRuns.filter(run => run.level > 0);
    if (completedRuns.length > 0) {
        const highestLevel = Math.max(...completedRuns.map(r => r.level));
        const bestScore = Math.max(...completedRuns.map(r => r.score));
        const weeklyCompletions = characterRuns.filter(r => r.weeklyComplete).length;

        embed.addFields({
            name: 'Dungeon Summary',
            value: `Highest Level: **+${highestLevel}**\nBest Score: **${bestScore}**\nCompleted by: **${completedRuns.length}** characters\n✅ Weekly (+12): **${weeklyCompletions}** characters`,
            inline: false
        });
    }

    return embed;
}

/**
 * Creates a raid progression embed
 * @param {Array} raidData - Array of character raid progression data
 * @returns {EmbedBuilder} Discord embed for raid progression
 */
function createRaidProgressionEmbed(raidData) {
    const embed = new EmbedBuilder()
        .setTitle('Raid Progression - Current Tier')
        .setColor(EMBED_COLORS.RAID_PROGRESSION)
        .setTimestamp();

    if (!raidData || raidData.length === 0) {
        embed.setDescription('No raid data available.');
        return embed;
    }

    // First, collect all raids with activity to find the most relevant one
    const raidActivity = new Map();

    raidData.forEach(character => {
        character.prog.forEach(raid => {
            const totalKills = raid.normal + raid.heroic + raid.mythic;
            if (totalKills > 0) {
                if (!raidActivity.has(raid.name)) {
                    raidActivity.set(raid.name, {
                        raid: raid,
                        characters: [],
                        hasRecentActivity: true
                    });
                }
                raidActivity.get(raid.name).characters.push({
                    ...character,
                    raidData: raid
                });
            }
        });
    });

    // If we have raid activity, find the most relevant raid and include ALL characters
    if (raidActivity.size > 0) {
        // Use findMostRelevantRaid or just get the first one for now
        const mostRelevantRaid = findMostRelevantRaid(raidActivity);
        const targetRaidName = mostRelevantRaid ? mostRelevantRaid.raidName : raidActivity.keys().next().value;
        const displayName = formatRaidDisplayName(targetRaidName);

        embed.setDescription(`**${displayName}**`);

        // Get total bosses count from any character that has this raid data
        const sampleRaidData = raidActivity.get(targetRaidName)?.raid;
        const totalBosses = sampleRaidData?.total_bosses || 8; // Fallback to 8

        // Now collect ALL characters for this specific raid (including those with 0 progress)
        const allCharactersForRaid = raidData.map(character => {
            // Find this character's progress in the target raid
            const raidProgress = character.prog.find(raid => raid.name === targetRaidName);

            return {
                ...character,
                raidData: raidProgress || {
                    name: targetRaidName,
                    normal: 0,
                    heroic: 0,
                    mythic: 0,
                    total_bosses: totalBosses,
                    summary: `0/${totalBosses}` // Default for no progress
                }
            };
        });

        // Group characters by role for raid display
        const roleGroups = groupCharactersByRole(allCharactersForRaid);

        Object.keys(roleGroups).forEach(role => {
            if (roleGroups[role].length > 0) {
                const roleData = roleGroups[role]
                    .map(char => {
                        const progress = char.raidData.summary || `0/${char.raidData.total_bosses}`;
                        return `**${char.name}** - ${progress}`;
                    })
                    .join('\n');

                embed.addFields({
                    name: `${ROLE_ICONS[role]} ${role}`,
                    value: roleData,
                    inline: true
                });
            }
        });
    } else {
        embed.setDescription('No raid progression found for any characters.');
    }

    return embed;
}

/**
 * Creates a weekly M+ runs embed with detailed breakdown by key level and completion status
 * @param {Array} mplusData - Array of character recent runs data
 * @param {Date} lastReset - Date of last weekly reset
 * @returns {EmbedBuilder} Discord embed for weekly M+ stats
 */
function createWeeklyMplusEmbed(mplusData, lastReset) {
    const embed = new EmbedBuilder()
        .setTitle('Weekly M+ Runs - Since Tuesday Reset')
        .setColor(EMBED_COLORS.WEEKLY_MPLUS)
        .setTimestamp();

    embed.setDescription(`Runs completed since <t:${Math.floor(lastReset.getTime() / 1000)}:F>`);

    if (!mplusData || mplusData.length === 0) {
        embed.setDescription('No M+ data available.');
        return embed;
    }

    // Import calculateWeeklyStats function
    const { calculateWeeklyStats } = require('./data-formatters');

    // Process weekly statistics for each character
    const roleGroups = groupCharactersByRole(mplusData);

    // Cache stats for all characters to avoid recalculating during sort and display
    const statsCache = new Map();
    mplusData.forEach(character => {
        const stats = calculateWeeklyStats(character.recent_runs || [], lastReset, character.name);
        statsCache.set(character.name, stats);
    });

    // Sort characters within each role by weekly performance
    Object.keys(roleGroups).forEach(role => {
        roleGroups[role].sort((a, b) => {
            const aStats = statsCache.get(a.name);
            const bStats = statsCache.get(b.name);

            // Sort by ultra high level runs first, then high, mid, then total runs
            if (aStats.ultraHighTotal !== bStats.ultraHighTotal) return bStats.ultraHighTotal - aStats.ultraHighTotal;
            if (aStats.highTotal !== bStats.highTotal) return bStats.highTotal - aStats.highTotal;
            if (aStats.midTotal !== bStats.midTotal) return bStats.midTotal - aStats.midTotal;
            return bStats.allWeeklyRuns - aStats.allWeeklyRuns;
        });
    });

    Object.keys(roleGroups).forEach(role => {
        if (roleGroups[role].length > 0) {
            const roleData = roleGroups[role]
                .map(character => {
                    const stats = statsCache.get(character.name);

                    let result = `**${getClassIcon(character.class)}${character.name}**`;

                    // Show key level categories
                    if (stats.ultraHighTotal > 0) {
                        result += `\n≥13: ${stats.ultraHighTotal} runs`;
                    }

                    if (stats.highTotal > 0) {
                        result += `\n12: ${stats.highTotal} runs`;
                    }

                    if (stats.midTotal > 0) {
                        result += `\n10-11: ${stats.midTotal} runs`;
                    }

                    if (stats.lowTotal > 0) {
                        result += `\n≤9: ${stats.lowTotal} runs`;
                    }

                    // If no runs this week
                    if (stats.allWeeklyRuns === 0) {
                        result += `\nNo runs this week`;

                        // Still show resilient vault key if they have it (12+)
                        if (stats.vaultKeyLevel >= 12) {
                            result += `\n:warning: Next week: +${stats.vaultKeyLevel}`;
                        }
                    } else {
                        // Show next week's vault key level with checkmark/X for runs completed this week
                        const emoji = stats.vaultKeyLevel >= 12 ? '✅' : '❌';
                        result += `\n${emoji} Next week: +${stats.vaultKeyLevel}`;
                    }

                    return result;
                })
                .join('\n\n');

            embed.addFields({
                name: `${ROLE_ICONS[role]} ${role}`,
                value: roleData,
                inline: true
            });
        }
    });

    // Add weekly summary statistics
    const allCharacters = Object.values(roleGroups).flat();
    if (allCharacters.length > 0) {
        let totalUltraHighRuns = 0;
        let totalHighRuns = 0;
        let totalMidRuns = 0;
        let totalLowRuns = 0;

        allCharacters.forEach(character => {
            const stats = statsCache.get(character.name);
            totalUltraHighRuns += stats.ultraHighTotal;
            totalHighRuns += stats.highTotal;
            totalMidRuns += stats.midTotal;
            totalLowRuns += stats.lowTotal;
        });

        const summaryLines = [];
        if (totalUltraHighRuns > 0) {
            summaryLines.push(`**≥13 Keys:** ${totalUltraHighRuns} total`);
        }
        if (totalHighRuns > 0) {
            summaryLines.push(`**12 Keys:** ${totalHighRuns} total`);
        }
        if (totalMidRuns > 0) {
            summaryLines.push(`**10-11 Keys:** ${totalMidRuns} total`);
        }
        if (totalLowRuns > 0) {
            summaryLines.push(`**≤9 Keys:** ${totalLowRuns} total`);
        }

        if (summaryLines.length > 0) {
            embed.addFields({
                name: 'Weekly Summary',
                value: summaryLines.join('\n'),
                inline: false
            });
        }
    }

    return embed;
}

/**
 * Creates an error embed for when data cannot be loaded
 * @param {string} errorMessage - Error message to display
 * @param {string} title - Optional custom title
 * @returns {EmbedBuilder} Discord embed for error state
 */
function createErrorEmbed(errorMessage, title = 'Error Loading Data') {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(errorMessage)
        .setColor(EMBED_COLORS.ERROR)
        .setTimestamp();
}

/**
 * Creates a no data embed for when character has no runs
 * @param {string} characterName - Name of the character
 * @param {Object} linksData - Character external links
 * @returns {EmbedBuilder} Discord embed for no data state
 */
function createNoDataEmbed(characterName, linksData = null) {
    const embed = new EmbedBuilder()
        .setTitle(`${characterName} - No M+ Runs Found`)
        .setColor(EMBED_COLORS.NO_DATA)
        .setTimestamp();

    if (linksData) {
        embed.addFields({
            name: 'Character Links',
            value: `[RaiderIO](${linksData.raiderIoLink})\n[WarcraftLogs](${linksData.warcraftlogsLink})`,
            inline: false
        });
    }

    return embed;
}

module.exports = {
    EMBED_COLORS,
    createMainSummaryEmbed,
    createCharacterDetailEmbed,
    createDungeonComparisonEmbed,
    createRaidProgressionEmbed,
    createWeeklyMplusEmbed,
    createErrorEmbed,
    createNoDataEmbed,
    addGearFieldsToEmbed
};