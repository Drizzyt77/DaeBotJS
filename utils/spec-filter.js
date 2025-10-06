/**
 * Spec Filter Utility
 * Provides functions for filtering and organizing character data by spec
 * Used to show alternate spec runs and role-specific performance
 */

const logger = require('./logger');

/**
 * Maps WoW specs to their role (Tank, Healer, DPS)
 */
const SPEC_TO_ROLE = {
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
    'Frost': 'DPS',

    // Monk
    'Brewmaster': 'TANK',
    'Mistweaver': 'HEALING',
    'Windwalker': 'DPS',

    // Paladin
    'Holy': 'HEALING',
    'Protection': 'TANK',
    'Retribution': 'DPS',

    // Priest
    'Discipline': 'HEALING',
    'Holy': 'HEALING',
    'Shadow': 'DPS',

    // Rogue
    'Assassination': 'DPS',
    'Outlaw': 'DPS',
    'Subtlety': 'DPS',

    // Shaman
    'Elemental': 'DPS',
    'Enhancement': 'DPS',
    'Restoration': 'HEALING',

    // Warlock
    'Affliction': 'DPS',
    'Demonology': 'DPS',
    'Destruction': 'DPS',

    // Warrior
    'Arms': 'DPS',
    'Fury': 'DPS',
    'Protection': 'TANK'
};

/**
 * Gets the role for a given spec name
 * @param {string} specName - Name of the spec
 * @returns {string} Role (TANK, HEALING, DPS, or UNKNOWN)
 */
function getSpecRole(specName) {
    return SPEC_TO_ROLE[specName] || 'UNKNOWN';
}

/**
 * Filters character runs by spec name
 * @param {Array} runs - Array of run objects with spec_name property
 * @param {string} specName - Spec name to filter by
 * @returns {Array} Filtered runs
 */
function filterRunsBySpec(runs, specName) {
    if (!runs || !Array.isArray(runs)) {
        return [];
    }

    return runs.filter(run =>
        run.spec_name &&
        run.spec_name.toLowerCase() === specName.toLowerCase()
    );
}

/**
 * Filters character runs by role (Tank, Healer, DPS)
 * @param {Array} runs - Array of run objects with spec_name property
 * @param {string} role - Role to filter by (TANK, HEALING, DPS)
 * @returns {Array} Filtered runs
 */
function filterRunsByRole(runs, role) {
    if (!runs || !Array.isArray(runs)) {
        return [];
    }

    const roleUpper = role.toUpperCase();

    return runs.filter(run => {
        if (!run.spec_name) return false;
        const runRole = getSpecRole(run.spec_name);
        return runRole === roleUpper;
    });
}

/**
 * Groups runs by spec, with summary statistics
 * @param {Array} runs - Array of run objects with spec_name property
 * @returns {Object} Object with specs as keys and run data/stats as values
 */
function groupAndSummarizeBySpec(runs) {
    if (!runs || !Array.isArray(runs)) {
        return {};
    }

    const grouped = {};

    runs.forEach(run => {
        const specName = run.spec_name || 'Unknown';

        if (!grouped[specName]) {
            grouped[specName] = {
                specName,
                role: getSpecRole(specName),
                runs: [],
                stats: {
                    totalRuns: 0,
                    avgLevel: 0,
                    highestKey: 0,
                    lowestKey: 999,
                    timedRuns: 0,
                    dungeonsCovered: new Set()
                }
            };
        }

        grouped[specName].runs.push(run);
        grouped[specName].stats.totalRuns++;
        grouped[specName].stats.highestKey = Math.max(grouped[specName].stats.highestKey, run.mythic_level);
        grouped[specName].stats.lowestKey = Math.min(grouped[specName].stats.lowestKey, run.mythic_level);

        if (run.is_completed_within_time) {
            grouped[specName].stats.timedRuns++;
        }

        if (run.dungeon) {
            grouped[specName].stats.dungeonsCovered.add(run.dungeon);
        }
    });

    // Calculate averages and convert Sets to Arrays
    Object.values(grouped).forEach(specData => {
        const stats = specData.stats;
        stats.avgLevel = stats.totalRuns > 0
            ? specData.runs.reduce((sum, r) => sum + r.mythic_level, 0) / stats.totalRuns
            : 0;
        stats.dungeonsCovered = Array.from(stats.dungeonsCovered);
    });

    return grouped;
}

/**
 * Identifies alternate spec runs (runs not on the character's main spec/role)
 * @param {Object} characterData - Character data with role and spec_specific_runs
 * @param {string} mainSpec - Main spec to compare against (optional, uses character role if not provided)
 * @returns {Object} Alternate spec information
 */
function findAlternateSpecRuns(characterData, mainSpec = null) {
    if (!characterData.spec_specific_runs || !Array.isArray(characterData.spec_specific_runs)) {
        return {
            hasAlternateRuns: false,
            mainSpecRuns: [],
            alternateSpecRuns: [],
            alternateSpecs: []
        };
    }

    const grouped = groupAndSummarizeBySpec(characterData.spec_specific_runs);
    const mainRole = characterData.role || 'UNKNOWN';

    // Determine what counts as "main spec"
    const mainSpecs = mainSpec
        ? [mainSpec]
        : Object.keys(grouped).filter(spec => getSpecRole(spec) === mainRole);

    // Separate main spec runs from alternate spec runs
    const mainSpecRuns = [];
    const alternateSpecRuns = [];
    const alternateSpecs = [];

    Object.entries(grouped).forEach(([specName, specData]) => {
        if (mainSpecs.includes(specName)) {
            mainSpecRuns.push(...specData.runs);
        } else {
            alternateSpecRuns.push(...specData.runs);
            alternateSpecs.push({
                specName: specName,
                role: specData.role,
                ...specData.stats
            });
        }
    });

    return {
        hasAlternateRuns: alternateSpecRuns.length > 0,
        mainSpecRuns,
        alternateSpecRuns,
        alternateSpecs,
        grouped
    };
}

/**
 * Formats spec summary for display
 * @param {Object} specData - Spec data with runs and stats
 * @returns {string} Formatted summary string
 */
function formatSpecSummary(specData) {
    const stats = specData.stats;
    return `**${specData.specName}** (${specData.role})
  - Runs: ${stats.totalRuns} | Highest: +${stats.highestKey} | Avg: ${stats.avgLevel.toFixed(1)}
  - Timed: ${stats.timedRuns}/${stats.totalRuns} | Dungeons: ${stats.dungeonsCovered.length}`;
}

/**
 * Creates a comparison of runs across all specs for a character
 * @param {Object} characterData - Character data with spec_specific_runs
 * @returns {string} Formatted comparison text
 */
function createSpecComparison(characterData) {
    if (!characterData.spec_specific_runs || !Array.isArray(characterData.spec_specific_runs)) {
        return 'No spec-specific run data available';
    }

    const grouped = groupAndSummarizeBySpec(characterData.spec_specific_runs);
    const specs = Object.keys(grouped);

    if (specs.length === 0) {
        return 'No runs found';
    }

    if (specs.length === 1) {
        return `All runs completed on **${specs[0]}**`;
    }

    let comparison = `**${characterData.name}** has runs on ${specs.length} specs:\n\n`;

    specs.forEach(specName => {
        comparison += formatSpecSummary(grouped[specName]) + '\n\n';
    });

    return comparison.trim();
}

/**
 * Finds dungeons completed on alternate specs
 * Useful for identifying content done on off-specs
 * @param {Object} characterData - Character data
 * @returns {Object} Dungeons grouped by spec
 */
function findDungeonsBySpec(characterData) {
    if (!characterData.spec_specific_runs) {
        return {};
    }

    const dungeonsBySpec = {};

    characterData.spec_specific_runs.forEach(run => {
        const specName = run.spec_name || 'Unknown';
        const dungeonName = run.dungeon;

        if (!dungeonsBySpec[specName]) {
            dungeonsBySpec[specName] = {};
        }

        if (!dungeonsBySpec[specName][dungeonName]) {
            dungeonsBySpec[specName][dungeonName] = [];
        }

        dungeonsBySpec[specName][dungeonName].push(run);
    });

    return dungeonsBySpec;
}

module.exports = {
    getSpecRole,
    filterRunsBySpec,
    filterRunsByRole,
    groupAndSummarizeBySpec,
    findAlternateSpecRuns,
    formatSpecSummary,
    createSpecComparison,
    findDungeonsBySpec,
    SPEC_TO_ROLE
};
