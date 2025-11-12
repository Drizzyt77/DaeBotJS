/**
 * Data formatting utilities for WoW character data transformation
 * Handles parsing and formatting of character information from various sources
 */

/**
 * Symbol mappings for Mythic+ key upgrade levels
 * Based on how many levels the key was upgraded upon completion
 */
const TIMED_SYMBOLS = {
    0: '',      // Failed/not timed
    1: '+',     // Timed (1 level upgrade)
    2: '++',    // Timed +1 (2 level upgrade)
    3: '+++'    // Timed +2 (3 level upgrade)
};

/**
 * Role icon mappings for Discord display
 * Uses emoji representations for each WoW role
 */
const ROLE_ICONS = {
    'TANK': '🛡️',
    'HEALING': '💚',
    'DPS': '⚔️'
};

/**
 * Class icons from Unicode fallbacks if custom Discord emojis aren't available
 * Provides thematic emoji representations for each WoW class
 */

const CLASS_ICONS = {
    "Death Knight": "<:dk:1419047320095424722>", 
    "Demon Hunter": "<:dh:1419047318119776476>",
    "Druid": "<:druid:1419047315918028932>",
    "Evoker": "<:evoker:1419049450701062296>",
    "Hunter": "<:hunter:1419047323404730470>",
    "Mage": "<:mage:1419047324503511080>",
    "Monk": "<:monk:1419047317113143610> ",
    "Paladin": "<:paladin:1419047368783036529>",
    "Priest": "<:priest:1419047367113576489>",
    "Rogue": "<:rogue:1419047325581447239>",
    "Shaman": "<:shaman:1419047315045617797>",
    "Warlock": "<:warlock:1419047329318568138>",
    "Warrior": "<:warrior:1419047322159153232>"
};

const CLASS_UNICODE = {
    'Death Knight': '💀',
    'Demon Hunter': '😈',
    'Druid': '🌿',
    'Evoker': '🐲',
    'Hunter': '🏹',
    'Mage': '🔮',
    'Monk': '👊',
    'Paladin': '⚔️',
    'Priest': '✨',
    'Rogue': '🗡️',
    'Shaman': '⚡',
    'Warlock': '🔥',
    'Warrior': '🛡️'
};

/**
 * Gets the appropriate timed symbol for a Mythic+ key upgrade level
 * @param {number} timedValue - Number of key upgrades (0-3)
 * @returns {string} Symbol representing the upgrade level
 */
function getTimedSymbol(timedValue) {
    return timedValue in TIMED_SYMBOLS ? TIMED_SYMBOLS[timedValue] : '+';
}

/**
 * Gets the role icon for display purposes
 * @param {string} roleName - WoW role name (TANK, HEALING, DPS)
 * @returns {string} Emoji representation of the role
 */
function getRoleIcon(roleName) {
    return ROLE_ICONS[roleName] || ROLE_ICONS['DPS'];
}

/**
 * Gets class icon from custom Discord emojis or Unicode fallback
 * @param {string} className - WoW class name
 * @returns {string} Icon representation of the class
 */
function getClassIcon(className) {
    return CLASS_ICONS[className] || CLASS_UNICODE[className] || '🏆';
}

/**
 * Calculates total score across all Mythic+ runs for a character
 * @param {Array} runs - Array of Mythic+ run objects with score property
 * @returns {number} Total score rounded to 1 decimal place
 */
function calculateTotalScore(runs) {
    if (!Array.isArray(runs) || runs.length === 0) return 0;

    return parseFloat(
        runs.reduce((sum, run) => sum + (run.score || 0), 0).toFixed(1)
    );
}

/**
 * Finds the highest scoring run from an array of Mythic+ runs
 * @param {Array} runs - Array of Mythic+ run objects
 * @returns {Object|null} Run with the highest score, or null if no runs
 */
function getHighestScoreRun(runs) {
    if (!Array.isArray(runs) || runs.length === 0) return null;

    return runs.reduce((highest, current) =>
        (current.score || 0) > (highest.score || 0) ? current : highest
    );
}

/**
 * Finds the lowest scoring run from an array of Mythic+ runs
 * @param {Array} runs - Array of Mythic+ run objects
 * @returns {Object|null} Run with the lowest score, or null if no runs
 */
function getLowestScoreRun(runs) {
    if (!Array.isArray(runs) || runs.length === 0) return null;

    return runs.reduce((lowest, current) =>
        (current.score || 0) < (lowest.score || 0) ? current : lowest
    );
}

/**
 * Formats a character's main summary display text for embeds
 * @param {Object} character - Character data object
 * @returns {Object} Formatted character summary with name and value
 */
function formatCharacterSummary(character) {
    const runs = character.mythic_plus_runs || [];
    const classIcon = getClassIcon(character.class);
    const roleIcon = getRoleIcon(character.role);

    const name = `${roleIcon} ${classIcon} ${character.name}`;

    if (runs.length === 0) {
        return {
            name,
            value: 'No M+ runs found'
        };
    }

    const highestRun = getHighestScoreRun(runs);
    const lowestRun = getLowestScoreRun(runs);
    const totalScore = calculateTotalScore(runs);

    const highestSymbol = getTimedSymbol(highestRun?.timed);
    const lowestSymbol = getTimedSymbol(lowestRun?.timed);

    const value = [
        `Best Key: **${highestRun.mythic_level}${highestSymbol}**`,
        `Worst Key: **${lowestRun.mythic_level}${lowestSymbol}** (${lowestRun.dungeon})`,
        `Total Score: **${totalScore}**`
    ].join('\n');

    return { name, value };
}

/**
 * Formats detailed run list for a character's individual view
 * @param {Array} runs - Array of Mythic+ run objects
 * @returns {string} Formatted string of all runs sorted by score
 */
function formatDetailedRuns(runs) {
    if (!Array.isArray(runs) || runs.length === 0) {
        return 'No runs available';
    }

    return runs
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .map(run => {
            const symbol = getTimedSymbol(run.timed);
            return `**${run.dungeon}**\n${run.mythic_level}${symbol} | Score: ${run.score}`;
        })
        .join('\n\n');
}

/**
 * Groups characters by their role for organized display
 * @param {Array} characters - Array of character objects
 * @returns {Object} Characters grouped by role (TANK, HEALING, DPS)
 */
function groupCharactersByRole(characters) {
    const roleGroups = {
        'TANK': [],
        'HEALING': [],
        'DPS': []
    };

    characters.forEach(character => {
        const role = character.role || 'DPS';
        if (roleGroups[role]) {
            roleGroups[role].push(character);
        } else {
            roleGroups['DPS'].push(character);
        }
    });

    return roleGroups;
}

/**
 * Formats raid progression display name from API slug format
 * @param {string} raidName - Raid name in slug format (e.g., "nerubar-palace")
 * @returns {string} Formatted display name (e.g., "Nerubar Palace")
 */
function formatRaidDisplayName(raidName) {
    return raidName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Sorts raid activities to determine the most current/relevant raid
 * @param {Map} raidActivity - Map of raid activities with stats
 * @returns {Object|null} Most relevant raid data, or null if none found
 */
function findMostRelevantRaid(raidActivity) {
    let bestRaid = null;
    let bestScore = -1;

    for (const [raidName, activity] of raidActivity) {
        let score = 0;

        // Heavily weight raids with incomplete progression (active content)
        if (activity.hasRecentActivity) score += 1000;

        // Weight by character participation
        score += activity.characterCount * 10;

        // Weight by total activity level
        score += activity.totalActivity;

        // Bonus for ongoing mythic progression
        if (activity.maxMythicKills > 0 && activity.maxMythicKills < activity.raid.total_bosses) {
            score += 500;
        }

        if (score > bestScore) {
            bestScore = score;
            bestRaid = { raidName, ...activity };
        }
    }

    return bestRaid;
}

/**
 * Calculates weekly run statistics for Mythic+ tracking
 * @param {Array} runs - Array of recent run objects with completed_at dates
 * @param {Date} lastReset - Date of the last weekly reset
 * @param {string} characterName - Optional character name for resilient level calculation
 * @returns {Object} Statistics object with categorized run counts
 */
function calculateWeeklyStats(runs, lastReset, characterName = null) {
    const weeklyRuns = runs.filter(run => {
        const runDate = new Date(run.completed_at);
        return runDate >= lastReset;
    });

    // Categorize runs by new key level ranges
    const ultraHighRuns = weeklyRuns.filter(run => run.mythic_level >= 13);
    const highRuns = weeklyRuns.filter(run => run.mythic_level === 12);
    const midRuns = weeklyRuns.filter(run => run.mythic_level >= 10 && run.mythic_level <= 11);
    const lowRuns = weeklyRuns.filter(run => run.mythic_level <= 9);

    // Calculate resilient keystone level from database
    // This queries the database for the highest level where ALL dungeons are timed
    // Calculate this OUTSIDE the weekly runs check so it works even with no runs this week
    let resilientLevel = 0;

    if (characterName) {
        try {
            const { calculateResilientLevel } = require('../services/run-query-service');
            const { getConfigService } = require('../services/config-service');
            const config = getConfigService();

            // Pass season filter to ensure resilient level only considers current season dungeons
            resilientLevel = calculateResilientLevel(characterName, {
                season: config.getCurrentSeasonName()
            });
        } catch (error) {
            // If database query fails, resilient level remains 0
            resilientLevel = 0;
        }
    }

    // Calculate weekly vault key level based on priority rules including Resilient Keystone
    let vaultKeyLevel = 2; // Default if no runs

    if (weeklyRuns.length > 0) {
        // Find highest timed key level
        const timedRuns = weeklyRuns.filter(run => run.num_keystone_upgrades > 0);
        const highestTimedLevel = timedRuns.length > 0 ? Math.max(...timedRuns.map(r => r.mythic_level)) : 0;

        // Find highest untimed key level
        const untimedRuns = weeklyRuns.filter(run => run.num_keystone_upgrades === 0);
        const highestUntimedLevel = untimedRuns.length > 0 ? Math.max(...untimedRuns.map(r => r.mythic_level)) : 0;
        const untimedDropLevel = highestUntimedLevel > 0 ? Math.max(2, highestUntimedLevel - 1) : 0;

        // Apply priority rules - take the highest of all possible vault sources
        const vaultOptions = [
            2, // Default minimum
            resilientLevel, // Resilient keystone level
            highestTimedLevel, // Highest timed key
            untimedDropLevel // One level lower than highest untimed
        ];

        vaultKeyLevel = Math.max(...vaultOptions);
    } else {
        // No runs this week - use resilient level if available
        vaultKeyLevel = Math.max(2, resilientLevel);
    }

    // Count runs in each category (no more timed/untimed tracking)
    const stats = {
        ultraHighTotal: ultraHighRuns.length,
        highTotal: highRuns.length,
        midTotal: midRuns.length,
        lowTotal: lowRuns.length,
        allWeeklyRuns: weeklyRuns.length,
        vaultKeyLevel: vaultKeyLevel
    };

    return stats;
}

module.exports = {
    getTimedSymbol,
    getRoleIcon,
    getClassIcon,
    calculateTotalScore,
    getHighestScoreRun,
    getLowestScoreRun,
    formatCharacterSummary,
    formatDetailedRuns,
    groupCharactersByRole,
    formatRaidDisplayName,
    findMostRelevantRaid,
    calculateWeeklyStats,
    ROLE_ICONS,
    CLASS_UNICODE
};