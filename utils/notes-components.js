/**
 * Notes UI Components Utility
 * Provides Discord UI components for the notes system including modals and buttons
 */

const {
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} = require('discord.js');

// Import main menu component ID for navigation
const { COMPONENT_IDS } = require('./ui-components');

/**
 * Component IDs for notes system
 */
const NOTES_COMPONENT_IDS = {
    NOTES_PAGE: 'notes_page',
    ADD_NOTE: 'notes_add',
    EDIT_NOTE: 'notes_edit',
    DELETE_NOTE: 'notes_delete',
    COMPLETE_NOTE: 'notes_complete',
    UNCOMPLETE_NOTE: 'notes_uncomplete',
    NOTE_SELECT: 'notes_select',
    NOTES_FILTER: 'notes_filter',
    CLEANUP_NOTES: 'notes_cleanup'
};

/**
 * Modal IDs for notes system
 */
const NOTES_MODAL_IDS = {
    ADD_NOTE: 'notes_modal_add',
    EDIT_NOTE: 'notes_modal_edit'
};

/**
 * Text input IDs for modals
 */
const NOTES_INPUT_IDS = {
    CONTENT: 'notes_input_content',
    DUE_DATE: 'notes_input_due_date'
};

/**
 * Creates a notes page navigation button for the main menu
 * @returns {ButtonBuilder} Discord button component
 */
function createNotesPageButton() {
    return new ButtonBuilder()
        .setCustomId(NOTES_COMPONENT_IDS.NOTES_PAGE)
        .setLabel('Notes')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📝');
}

/**
 * Creates an add note button
 * @returns {ButtonBuilder} Discord button component
 */
function createAddNoteButton() {
    return new ButtonBuilder()
        .setCustomId(NOTES_COMPONENT_IDS.ADD_NOTE)
        .setLabel('Add Note')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕');
}

/**
 * Creates a delete note button
 * @param {boolean} disabled - Whether the button should be disabled
 * @param {string} noteId - Optional note ID to embed in custom ID
 * @returns {ButtonBuilder} Discord button component
 */
function createDeleteNoteButton(disabled = false, noteId = null) {
    const customId = noteId ? `${NOTES_COMPONENT_IDS.DELETE_NOTE}_${noteId}` : NOTES_COMPONENT_IDS.DELETE_NOTE;
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(disabled);
}

/**
 * Creates a complete note button
 * @param {boolean} disabled - Whether the button should be disabled
 * @param {string} noteId - Optional note ID to embed in custom ID
 * @returns {ButtonBuilder} Discord button component
 */
function createCompleteNoteButton(disabled = false, noteId = null) {
    const customId = noteId ? `${NOTES_COMPONENT_IDS.COMPLETE_NOTE}_${noteId}` : NOTES_COMPONENT_IDS.COMPLETE_NOTE;
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel('Complete')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
        .setDisabled(disabled);
}

/**
 * Creates an uncomplete note button
 * @param {boolean} disabled - Whether the button should be disabled
 * @param {string} noteId - Optional note ID to embed in custom ID
 * @returns {ButtonBuilder} Discord button component
 */
function createUncompleteNoteButton(disabled = false, noteId = null) {
    const customId = noteId ? `${NOTES_COMPONENT_IDS.UNCOMPLETE_NOTE}_${noteId}` : NOTES_COMPONENT_IDS.UNCOMPLETE_NOTE;
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel('Uncomplete')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('↩️')
        .setDisabled(disabled);
}

/**
 * Creates an edit note button
 * @param {boolean} disabled - Whether the button should be disabled
 * @param {string} noteId - Optional note ID to embed in custom ID
 * @returns {ButtonBuilder} Discord button component
 */
function createEditNoteButton(disabled = false, noteId = null) {
    const customId = noteId ? `${NOTES_COMPONENT_IDS.EDIT_NOTE}_${noteId}` : NOTES_COMPONENT_IDS.EDIT_NOTE;
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel('Edit')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✏️')
        .setDisabled(disabled);
}

/**
 * Creates a cleanup old notes button
 * @returns {ButtonBuilder} Discord button component
 */
function createCleanupNotesButton() {
    return new ButtonBuilder()
        .setCustomId(NOTES_COMPONENT_IDS.CLEANUP_NOTES)
        .setLabel('Cleanup Old')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🧹');
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
 * Creates a note selection dropdown menu
 * @param {Array} notes - Array of note objects
 * @param {string} placeholder - Placeholder text for the dropdown
 * @returns {StringSelectMenuBuilder} Discord select menu component
 */
function createNoteSelectMenu(notes, placeholder = 'Select a note to manage') {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(NOTES_COMPONENT_IDS.NOTE_SELECT)
        .setPlaceholder(placeholder);

    if (notes.length === 0) {
        selectMenu.addOptions({
            label: 'No notes available',
            value: 'no_notes',
            description: 'There are no notes to select'
        });
        selectMenu.setDisabled(true);
    } else {
        const options = notes.slice(0, 25).map(note => { // Discord limit of 25 options
            const truncatedContent = note.content.length > 50
                ? note.content.substring(0, 47) + '...'
                : note.content;

            let description = `Created: ${new Date(note.createdAt).toLocaleDateString()}`;
            if (note.dueDate) {
                description += ` | Due: ${new Date(note.dueDate).toLocaleDateString()}`;
            }
            if (note.completed) {
                description += ' | ✅ Completed';
            }

            return {
                label: truncatedContent,
                value: note.id,
                description: description.length > 100 ? description.substring(0, 97) + '...' : description,
                emoji: note.completed ? '✅' : (note.dueDate && new Date(note.dueDate) < new Date() ? '⚠️' : '📝')
            };
        });

        selectMenu.addOptions(options);
    }

    return selectMenu;
}

/**
 * Creates a filter dropdown for notes
 * @param {string} currentFilter - Current filter value
 * @returns {StringSelectMenuBuilder} Discord select menu component
 */
function createNotesFilterMenu(currentFilter = 'all') {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(NOTES_COMPONENT_IDS.NOTES_FILTER)
        .setPlaceholder('Filter notes')
        .addOptions([
            {
                label: 'All Notes',
                value: 'all',
                description: 'Show all notes',
                emoji: '📝',
                default: currentFilter === 'all'
            },
            {
                label: 'Pending Notes',
                value: 'pending',
                description: 'Show incomplete notes only',
                emoji: '⏳',
                default: currentFilter === 'pending'
            },
            {
                label: 'Completed Notes',
                value: 'completed',
                description: 'Show completed notes only',
                emoji: '✅',
                default: currentFilter === 'completed'
            },
            {
                label: 'Overdue Notes',
                value: 'overdue',
                description: 'Show overdue notes only',
                emoji: '⚠️',
                default: currentFilter === 'overdue'
            }
        ]);

    return selectMenu;
}

/**
 * Creates the main notes page components
 * @param {Array} notes - Array of note objects
 * @param {string} filter - Current filter setting
 * @returns {Array} Array of ActionRowBuilder components
 */
function createNotesPageComponents(notes, filter = 'all') {
    const components = [];

    // Filter dropdown row
    const filterRow = new ActionRowBuilder()
        .addComponents(createNotesFilterMenu(filter));
    components.push(filterRow);

    // Note selection row (if there are notes)
    if (notes.length > 0) {
        const selectRow = new ActionRowBuilder()
            .addComponents(createNoteSelectMenu(notes));
        components.push(selectRow);
    }

    // Action buttons row
    const actionButtons = [createAddNoteButton()];

    if (notes.length > 0) {
        actionButtons.push(createEditNoteButton(true)); // Disabled until note selected
        actionButtons.push(createCompleteNoteButton(true)); // Disabled until note selected
    }

    const actionRow = new ActionRowBuilder().addComponents(actionButtons);
    components.push(actionRow);

    // Management buttons row
    const managementButtons = [];

    if (notes.length > 0) {
        managementButtons.push(createDeleteNoteButton(true)); // Disabled until note selected
    }

    // Always show cleanup button if there might be old completed notes
    managementButtons.push(createCleanupNotesButton());

    if (managementButtons.length > 0) {
        const managementRow = new ActionRowBuilder().addComponents(managementButtons);
        components.push(managementRow);
    }

    // Navigation row with main menu button
    const navigationRow = new ActionRowBuilder()
        .addComponents(createMainMenuButton());
    components.push(navigationRow);

    return components;
}

/**
 * Creates components for when a specific note is selected
 * @param {Object} selectedNote - The selected note object
 * @returns {Array} Array of ActionRowBuilder components
 */
function createSelectedNoteComponents(selectedNote) {
    const components = [];

    // Main action buttons
    const actionButtons = [
        createAddNoteButton(),
        createEditNoteButton(false, selectedNote.id)
    ];

    if (selectedNote.completed) {
        actionButtons.push(createUncompleteNoteButton(false, selectedNote.id));
    } else {
        actionButtons.push(createCompleteNoteButton(false, selectedNote.id));
    }

    const actionRow = new ActionRowBuilder().addComponents(actionButtons);
    components.push(actionRow);

    // Delete button in its own row
    const deleteRow = new ActionRowBuilder()
        .addComponents(createDeleteNoteButton(false, selectedNote.id));
    components.push(deleteRow);

    // Navigation row with main menu button
    const navigationRow = new ActionRowBuilder()
        .addComponents(createMainMenuButton());
    components.push(navigationRow);

    return components;
}

/**
 * Creates the add note modal
 * @returns {ModalBuilder} Discord modal component
 */
function createAddNoteModal() {
    const modal = new ModalBuilder()
        .setCustomId(NOTES_MODAL_IDS.ADD_NOTE)
        .setTitle('Add New Note');

    // Note content input
    const contentInput = new TextInputBuilder()
        .setCustomId(NOTES_INPUT_IDS.CONTENT)
        .setLabel('Note Content')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter your note content here...')
        .setRequired(true)
        .setMaxLength(1000);

    // Due date input (optional)
    const dueDateInput = new TextInputBuilder()
        .setCustomId(NOTES_INPUT_IDS.DUE_DATE)
        .setLabel('Due Date (Optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('YYYY-MM-DD or MM/DD/YYYY')
        .setRequired(false)
        .setMaxLength(20);

    const contentRow = new ActionRowBuilder().addComponents(contentInput);
    const dueDateRow = new ActionRowBuilder().addComponents(dueDateInput);

    modal.addComponents(contentRow, dueDateRow);

    return modal;
}

/**
 * Creates the edit note modal
 * @param {Object} note - Note object to edit
 * @returns {ModalBuilder} Discord modal component
 */
function createEditNoteModal(note) {
    const modal = new ModalBuilder()
        .setCustomId(`${NOTES_MODAL_IDS.EDIT_NOTE}_${note.id}`)
        .setTitle('Edit Note');

    // Note content input with current content
    const contentInput = new TextInputBuilder()
        .setCustomId(NOTES_INPUT_IDS.CONTENT)
        .setLabel('Note Content')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter your note content here...')
        .setRequired(true)
        .setMaxLength(1000)
        .setValue(note.content);

    // Due date input with current due date
    const dueDateInput = new TextInputBuilder()
        .setCustomId(NOTES_INPUT_IDS.DUE_DATE)
        .setLabel('Due Date (Optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('YYYY-MM-DD or MM/DD/YYYY')
        .setRequired(false)
        .setMaxLength(20);

    if (note.dueDate) {
        const dueDate = new Date(note.dueDate);
        dueDateInput.setValue(dueDate.toISOString().split('T')[0]); // YYYY-MM-DD format
    }

    const contentRow = new ActionRowBuilder().addComponents(contentInput);
    const dueDateRow = new ActionRowBuilder().addComponents(dueDateInput);

    modal.addComponents(contentRow, dueDateRow);

    return modal;
}

/**
 * Parses a date string from user input
 * @param {string} dateString - User input date string
 * @returns {Date|null} Parsed date object or null if invalid
 */
function parseDateInput(dateString) {
    if (!dateString || !dateString.trim()) {
        return null;
    }

    const cleaned = dateString.trim();

    // Try different date formats
    const formats = [
        // ISO format: YYYY-MM-DD
        /^\d{4}-\d{2}-\d{2}$/,
        // US format: MM/DD/YYYY
        /^\d{1,2}\/\d{1,2}\/\d{4}$/,
        // US format: MM-DD-YYYY
        /^\d{1,2}-\d{1,2}-\d{4}$/
    ];

    let parsedDate = null;

    // Try to parse with native Date constructor
    parsedDate = new Date(cleaned);

    // Validate the parsed date
    if (parsedDate instanceof Date && !isNaN(parsedDate)) {
        // Make sure it's not in the past (allow today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (parsedDate >= today) {
            return parsedDate;
        }
    }

    return null;
}

module.exports = {
    NOTES_COMPONENT_IDS,
    NOTES_MODAL_IDS,
    NOTES_INPUT_IDS,
    createNotesPageButton,
    createAddNoteButton,
    createDeleteNoteButton,
    createCompleteNoteButton,
    createUncompleteNoteButton,
    createEditNoteButton,
    createCleanupNotesButton,
    createMainMenuButton,
    createNoteSelectMenu,
    createNotesFilterMenu,
    createNotesPageComponents,
    createSelectedNoteComponents,
    createAddNoteModal,
    createEditNoteModal,
    parseDateInput
};