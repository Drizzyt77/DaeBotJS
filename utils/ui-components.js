/**
 * Discord UI Components Builder Utility
 * Provides reusable functions for creating Discord.js components like buttons, select menus, and action rows
 * Centralizes UI component creation with consistent styling and behavior
 */

const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Custom ID prefixes for different component types
 * Used to identify component interactions in event handlers
 */
const COMPONENT_IDS = {
    CHARACTER_SELECT: 'char_character_select',
    DUNGEON_SELECT: 'char_dungeon_select',
    SPEC_SELECT: 'char_spec_select',
    REFRESH_DATA: 'char_refresh_data',
    MAIN_MENU: 'char_main_menu',
    RAID_DATA: 'char_raid_data',
    MPLUS_DATA: 'char_mplus_data',
    LINKS_MENU: 'char_links_menu',
    NOTES_PAGE: 'char_notes_page',
    CHARACTER_IMAGE_WIP: 'char_image_wip',
    VIEW_MODE_DETAILED: 'char_view_detailed',
    VIEW_MODE_COMPACT: 'char_view_compact',
    VIEW_MODE_COMPARISON: 'char_view_comparison'
};

/**
 * Mapping of WoW classes to their available specs
 */
const CLASS_SPECS = {
    'Death Knight': ['Blood', 'Frost', 'Unholy'],
    'Demon Hunter': ['Havoc', 'Vengeance'],
    'Druid': ['Balance', 'Feral', 'Guardian', 'Restoration'],
    'Evoker': ['Devastation', 'Preservation', 'Augmentation'],
    'Hunter': ['Beast Mastery', 'Marksmanship', 'Survival'],
    'Mage': ['Arcane', 'Fire', 'Frost'],
    'Monk': ['Brewmaster', 'Mistweaver', 'Windwalker'],
    'Paladin': ['Holy', 'Protection', 'Retribution'],
    'Priest': ['Discipline', 'Holy', 'Shadow'],
    'Rogue': ['Assassination', 'Outlaw', 'Subtlety'],
    'Shaman': ['Elemental', 'Enhancement', 'Restoration'],
    'Warlock': ['Affliction', 'Demonology', 'Destruction'],
    'Warrior': ['Arms', 'Fury', 'Protection']
};

/**
 * Creates a character selection dropdown menu
 * @param {Array} characters - Array of character objects with name property
 * @returns {StringSelectMenuBuilder} Discord select menu component
 */
function createCharacterSelectMenu(characters) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(COMPONENT_IDS.CHARACTER_SELECT)
        .setPlaceholder('Select a character for detailed view');

    // Add character options to the menu
    const options = characters.map(character => ({
        label: character.name,
        value: character.name,
        description: `View ${character.name}'s detailed dungeon runs`
    }));

    selectMenu.addOptions(options);
    return selectMenu;
}

/**
 * Creates a dungeon selection dropdown menu
 * @param {Set|Array} dungeons - Set or array of dungeon names
 * @returns {StringSelectMenuBuilder} Discord select menu component
 */
function createDungeonSelectMenu(dungeons) {
    const dungeonArray = Array.isArray(dungeons) ? dungeons : Array.from(dungeons);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(COMPONENT_IDS.DUNGEON_SELECT)
        .setPlaceholder('Select a dungeon to compare all characters');

    // Add dungeon options sorted alphabetically
    const options = dungeonArray
        .sort()
        .map(dungeon => ({
            label: dungeon,
            value: dungeon,
            description: `Compare all characters in ${dungeon}`
        }));

    selectMenu.addOptions(options);
    return selectMenu;
}

/**
 * Creates a spec selection dropdown menu for filtering runs by spec
 * @param {string} characterClass - WoW class name (e.g., 'Shaman', 'Paladin')
 * @param {string} currentSpec - Currently selected spec (default: 'Overall')
 * @returns {StringSelectMenuBuilder} Discord select menu component
 */
function createSpecSelectMenu(characterClass, currentSpec = 'Overall') {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(COMPONENT_IDS.SPEC_SELECT)
        .setPlaceholder('Select spec to view');

    // Start with "Overall" option
    const options = [{
        label: 'Overall',
        value: 'Overall',
        description: 'View all runs across all specs',
        default: currentSpec === 'Overall'
    }];

    // Add class-specific specs if class is recognized
    if (characterClass && CLASS_SPECS[characterClass]) {
        const specs = CLASS_SPECS[characterClass];
        specs.forEach(spec => {
            options.push({
                label: spec,
                value: spec,
                description: `View ${spec} spec runs only`,
                default: currentSpec === spec
            });
        });
    }

    selectMenu.addOptions(options);
    return selectMenu;
}

/**
 * Creates a refresh button for updating data
 * @param {boolean} disabled - Whether the button should be disabled
 * @returns {ButtonBuilder} Discord button component
 */
function createRefreshButton(disabled = false) {
    return new ButtonBuilder()
        .setCustomId(COMPONENT_IDS.REFRESH_DATA)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔄')
        .setDisabled(disabled);
}

/**
 * Creates a main menu navigation button
 * @returns {ButtonBuilder} Discord button component
 */
function createMainMenuButton() {
    return new ButtonBuilder()
        .setCustomId(COMPONENT_IDS.MAIN_MENU)
        .setLabel('Main Menu')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🏠');
}

/**
 * Creates a raid statistics button
 * @returns {ButtonBuilder} Discord button component
 */
function createRaidStatsButton() {
    return new ButtonBuilder()
        .setCustomId(COMPONENT_IDS.RAID_DATA)
        .setLabel('Raid Stats')
        .setStyle(ButtonStyle.Success);
}

/**
 * Creates a weekly M+ button
 * @returns {ButtonBuilder} Discord button component
 */
function createWeeklyMplusButton() {
    return new ButtonBuilder()
        .setCustomId(COMPONENT_IDS.MPLUS_DATA)
        .setLabel('Weekly M+')
        .setStyle(ButtonStyle.Success);
}

/**
 * Creates a character links button
 * @returns {ButtonBuilder} Discord button component
 */
function createLinksButton() {
    return new ButtonBuilder()
        .setCustomId(COMPONENT_IDS.LINKS_MENU)
        .setLabel('Character Links')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔗');
}

/**
 * Creates a notes page button
 * @returns {ButtonBuilder} Discord button component
 */
function createNotesButton() {
    return new ButtonBuilder()
        .setCustomId(COMPONENT_IDS.NOTES_PAGE)
        .setLabel('Notes')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📝');
}

/**
 * Creates a character image WIP button
 * @returns {ButtonBuilder} Discord button component
 */
function createCharacterImageWIPButton() {
    return new ButtonBuilder()
        .setCustomId(COMPONENT_IDS.CHARACTER_IMAGE_WIP)
        .setLabel('Image View (WIP)')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🖼️');
}

/**
 * Creates view mode buttons for character image display
 * @param {string} currentMode - Currently active view mode
 * @param {string} characterName - Name of the character (optional, for persistent context)
 * @returns {Array} Array of ButtonBuilder components
 */
function createViewModeButtons(currentMode = 'detailed', characterName = null) {
    // Create custom IDs with character name encoded for persistent context
    const detailedId = characterName ? `${COMPONENT_IDS.VIEW_MODE_DETAILED}_${characterName}` : COMPONENT_IDS.VIEW_MODE_DETAILED;
    const compactId = characterName ? `${COMPONENT_IDS.VIEW_MODE_COMPACT}_${characterName}` : COMPONENT_IDS.VIEW_MODE_COMPACT;
    const comparisonId = characterName ? `${COMPONENT_IDS.VIEW_MODE_COMPARISON}_${characterName}` : COMPONENT_IDS.VIEW_MODE_COMPARISON;

    const buttons = [
        new ButtonBuilder()
            .setCustomId(detailedId)
            .setLabel('Detailed')
            .setStyle(currentMode === 'detailed' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('📋'),
        new ButtonBuilder()
            .setCustomId(compactId)
            .setLabel('Compact')
            .setStyle(currentMode === 'compact' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('📄'),
        new ButtonBuilder()
            .setCustomId(comparisonId)
            .setLabel('Compare')
            .setStyle(currentMode === 'comparison' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('📊')
    ];

    return buttons;
}

/**
 * Creates the main menu components layout
 * @param {Array} characters - Array of character objects
 * @param {Set|Array} dungeons - Set or array of dungeon names
 * @returns {Array} Array of ActionRowBuilder components
 */
function createMainMenuComponents(characters, dungeons) {
    const components = [];

    // Character selection row
    if (characters.length > 0) {
        const characterRow = new ActionRowBuilder()
            .addComponents(createCharacterSelectMenu(characters));
        components.push(characterRow);
    }

    // Dungeon selection row
    if (dungeons.size > 0 || dungeons.length > 0) {
        const dungeonRow = new ActionRowBuilder()
            .addComponents(createDungeonSelectMenu(dungeons));
        components.push(dungeonRow);
    }

    // Button row with main actions
    const buttonRow = new ActionRowBuilder()
        .addComponents([
            createRaidStatsButton(),
            createWeeklyMplusButton(),
            createNotesButton(),
            createRefreshButton()
        ]);
    components.push(buttonRow);

    return components;
}

/**
 * Creates the character detail view components
 * @param {boolean} includeRefresh - Whether to include the refresh button
 * @param {Array} characters - Array of character objects for dropdown menu
 * @param {Set|Array} dungeons - Set or array of dungeon names for dropdown menu
 * @param {string} currentViewMode - Current view mode for styling buttons
 * @param {string} characterName - Name of the current character (for persistence)
 * @param {string} characterClass - Class of the current character (for spec dropdown)
 * @param {string} currentSpec - Currently selected spec filter (default: 'Overall')
 * @returns {Array} Array of ActionRowBuilder components
 */
function createCharacterDetailComponents(includeRefresh = true, characters = [], dungeons = new Set(), currentViewMode = 'detailed', characterName = null, characterClass = null, currentSpec = 'Overall') {
    const components = [];

    // Character selection row
    if (characters.length > 0) {
        const characterRow = new ActionRowBuilder()
            .addComponents(createCharacterSelectMenu(characters));
        components.push(characterRow);
    }

    // Spec selection row (for filtering by spec)
    if (characterClass) {
        const specRow = new ActionRowBuilder()
            .addComponents(createSpecSelectMenu(characterClass, currentSpec));
        components.push(specRow);
    }

    // Dungeon selection row
    if (dungeons.size > 0 || dungeons.length > 0) {
        const dungeonRow = new ActionRowBuilder()
            .addComponents(createDungeonSelectMenu(dungeons));
        components.push(dungeonRow);
    }

    // View mode buttons row with character name encoded for persistence
    const viewModeButtons = createViewModeButtons(currentViewMode, characterName);
    const viewModeRow = new ActionRowBuilder().addComponents(viewModeButtons);
    components.push(viewModeRow);

    // Button row with navigation and actions
    const buttons = [createMainMenuButton()];

    if (includeRefresh) {
        buttons.push(createRefreshButton());
    }

    // WIP image button removed - image generation now integrated into character selection

    const buttonRow = new ActionRowBuilder().addComponents(buttons);
    components.push(buttonRow);

    return components;
}

/**
 * Creates the dungeon comparison view components
 * @param {boolean} includeRefresh - Whether to include the refresh button
 * @returns {Array} Array of ActionRowBuilder components
 */
function createDungeonComparisonComponents(includeRefresh = true) {
    const buttons = [createMainMenuButton()];

    if (includeRefresh) {
        buttons.push(createRefreshButton());
    }

    const buttonRow = new ActionRowBuilder().addComponents(buttons);
    return [buttonRow];
}

/**
 * Creates components for raid statistics view
 * @returns {Array} Array of ActionRowBuilder components
 */
function createRaidStatsComponents() {
    const buttonRow = new ActionRowBuilder()
        .addComponents(createMainMenuButton());
    return [buttonRow];
}

/**
 * Creates components for weekly M+ view
 * @param {Array} characters - Array of character objects for dropdown menu
 * @param {Set|Array} dungeons - Set or array of dungeon names for dropdown menu
 * @returns {Array} Array of ActionRowBuilder components
 */
function createWeeklyMplusComponents(characters = [], dungeons = new Set()) {
    const components = [];

    // Character selection row
    if (characters.length > 0) {
        const characterRow = new ActionRowBuilder()
            .addComponents(createCharacterSelectMenu(characters));
        components.push(characterRow);
    }

    // Dungeon selection row
    if (dungeons.size > 0 || dungeons.length > 0) {
        const dungeonRow = new ActionRowBuilder()
            .addComponents(createDungeonSelectMenu(dungeons));
        components.push(dungeonRow);
    }

    // Button row with navigation
    const buttonRow = new ActionRowBuilder()
        .addComponents(createMainMenuButton());
    components.push(buttonRow);

    return components;
}

/**
 * Creates a simple back button row
 * @param {string} customId - Custom ID for the back button
 * @param {string} label - Button label
 * @param {string} emoji - Button emoji
 * @returns {Array} Array with single ActionRowBuilder
 */
function createBackButtonRow(customId = COMPONENT_IDS.MAIN_MENU, label = 'Back', emoji = '⬅️') {
    const backButton = new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji);

    const buttonRow = new ActionRowBuilder().addComponents(backButton);
    return [buttonRow];
}

/**
 * Creates error state components with retry option
 * @param {boolean} allowRetry - Whether to show a retry button
 * @returns {Array} Array of ActionRowBuilder components
 */
function createErrorComponents(allowRetry = true) {
    const buttons = [createMainMenuButton()];

    if (allowRetry) {
        const retryButton = new ButtonBuilder()
            .setCustomId(COMPONENT_IDS.REFRESH_DATA)
            .setLabel('Retry')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄');
        buttons.push(retryButton);
    }

    const buttonRow = new ActionRowBuilder().addComponents(buttons);
    return [buttonRow];
}

/**
 * Creates loading state components with disabled buttons
 * @returns {Array} Array of ActionRowBuilder components
 */
function createLoadingComponents() {
    const loadingButton = new ButtonBuilder()
        .setCustomId('loading')
        .setLabel('Loading...')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏳')
        .setDisabled(true);

    const buttonRow = new ActionRowBuilder().addComponents(loadingButton);
    return [buttonRow];
}

/**
 * Utility function to extract all unique dungeons from character data
 * @param {Array} characters - Array of character objects with mythic_plus_runs
 * @returns {Set} Set of unique dungeon names
 */
function extractUniqueDungeons(characters) {
    const dungeons = new Set();

    characters.forEach(character => {
        if (character.mythic_plus_runs) {
            character.mythic_plus_runs.forEach(run => {
                dungeons.add(run.dungeon);
            });
        }
    });

    return dungeons;
}

/**
 * Validates component data before creating components
 * @param {Array} characters - Character data to validate
 * @returns {Object} Validation result with isValid flag and errors
 */
function validateComponentData(characters) {
    const errors = [];

    if (!Array.isArray(characters)) {
        errors.push('Characters must be an array');
        return { isValid: false, errors };
    }

    if (characters.length === 0) {
        errors.push('No characters available');
    }

    characters.forEach((character, index) => {
        if (!character.name) {
            errors.push(`Character at index ${index} missing name`);
        }
    });

    return {
        isValid: errors.length === 0,
        errors
    };
}

module.exports = {
    COMPONENT_IDS,
    CLASS_SPECS,
    createCharacterSelectMenu,
    createDungeonSelectMenu,
    createSpecSelectMenu,
    createRefreshButton,
    createMainMenuButton,
    createRaidStatsButton,
    createWeeklyMplusButton,
    createLinksButton,
    createNotesButton,
    createCharacterImageWIPButton,
    createViewModeButtons,
    createMainMenuComponents,
    createCharacterDetailComponents,
    createDungeonComparisonComponents,
    createRaidStatsComponents,
    createWeeklyMplusComponents,
    createBackButtonRow,
    createErrorComponents,
    createLoadingComponents,
    extractUniqueDungeons,
    validateComponentData
};