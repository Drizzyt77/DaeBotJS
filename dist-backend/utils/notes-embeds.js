/**
 * Notes Embed Builders Utility
 * Provides functions for creating Discord embeds for the notes system
 */

const { EmbedBuilder } = require('discord.js');

/**
 * Color scheme for notes embeds
 */
const NOTES_EMBED_COLORS = {
    DEFAULT: 0x7289DA,      // Default Discord blurple
    SUCCESS: 0x00FF00,      // Green for success operations
    WARNING: 0xFFAA00,      // Orange for warnings/overdue
    ERROR: 0xFF0000,        // Red for errors
    INFO: 0x0099FF,         // Blue for informational
    COMPLETED: 0x00AA55     // Dark green for completed items
};

/**
 * Creates an embed for when there are no notes
 * @param {string} guildName - Name of the guild
 * @returns {EmbedBuilder} Discord embed for empty notes state
 */
function createEmptyNotesEmbed(guildName = 'this server') {
    return new EmbedBuilder()
        .setTitle('📝 Notes')
        .setDescription('No notes found for ' + guildName + '.')
        .setColor(NOTES_EMBED_COLORS.INFO)
        .addFields({
            name: 'Getting Started',
            value: 'Click the **Add Note** button below to create your first note!\n\n' +
                   '✅ Set optional due dates\n' +
                   '📅 Track completion status\n' +
                   '🗂️ Filter and organize notes',
            inline: false
        })
        .setTimestamp();
}

/**
 * Creates an embed displaying a list of notes
 * @param {Array} notes - Array of note objects
 * @param {Object} stats - Notes statistics object
 * @param {string} filter - Current filter being applied
 * @param {string} guildName - Name of the guild
 * @returns {EmbedBuilder} Discord embed for notes list
 */
function createNotesListEmbed(notes, stats, filter = 'all', guildName = 'this server') {
    const embed = new EmbedBuilder()
        .setTitle('📝 Notes')
        .setColor(NOTES_EMBED_COLORS.DEFAULT)
        .setTimestamp();

    // Set description based on filter
    const filterDescriptions = {
        all: `Showing all notes for ${guildName}`,
        pending: `Showing pending notes for ${guildName}`,
        completed: `Showing completed notes for ${guildName}`,
        overdue: `Showing overdue notes for ${guildName}`
    };

    embed.setDescription(filterDescriptions[filter] || filterDescriptions.all);

    // Add statistics field
    const statsValue = [
        `📊 **Total Notes:** ${stats.total}`,
        `⏳ **Pending:** ${stats.pending}`,
        `✅ **Completed:** ${stats.completed}`
    ];

    if (stats.overdue > 0) {
        statsValue.push(`⚠️ **Overdue:** ${stats.overdue}`);
    }

    if (stats.dueSoon > 0) {
        statsValue.push(`🕐 **Due Soon:** ${stats.dueSoon}`);
    }

    embed.addFields({
        name: 'Statistics',
        value: statsValue.join('\n'),
        inline: true
    });

    // Add notes list if there are notes to display
    if (notes.length > 0) {
        const notesValue = notes.slice(0, 10).map((note, index) => {
            return formatNoteForList(note, index + 1);
        }).join('\n\n');

        const listTitle = notes.length > 10
            ? `Notes (Showing 1-10 of ${notes.length})`
            : `Notes (${notes.length})`;

        embed.addFields({
            name: listTitle,
            value: notesValue,
            inline: false
        });

        if (notes.length > 10) {
            embed.setFooter({
                text: `Use the dropdown menu to select from all ${notes.length} notes`
            });
        }
    } else {
        embed.addFields({
            name: 'No Notes Found',
            value: filter === 'all'
                ? 'No notes have been created yet.'
                : `No ${filter} notes found.`,
            inline: false
        });
    }

    return embed;
}

/**
 * Creates an embed for displaying a specific note's details
 * @param {Object} note - Note object to display
 * @param {string} guildName - Name of the guild
 * @returns {EmbedBuilder} Discord embed for note details
 */
function createNoteDetailEmbed(note, guildName = 'this server') {
    const embed = new EmbedBuilder()
        .setTitle('📝 Note Details')
        .setColor(note.completed ? NOTES_EMBED_COLORS.COMPLETED : NOTES_EMBED_COLORS.DEFAULT)
        .setTimestamp();

    // Note content
    embed.setDescription(`**Content:**\n${note.content}`);

    // Status field
    const statusValue = note.completed
        ? `✅ **Completed**\n*Completed on ${formatDate(note.completedAt)}*`
        : '⏳ **Pending**';

    embed.addFields({
        name: 'Status',
        value: statusValue,
        inline: true
    });

    // Dates field
    const datesValue = [`**Created:** ${formatDate(note.createdAt)}`];

    if (note.dueDate) {
        const dueDate = new Date(note.dueDate);
        const now = new Date();
        const isOverdue = dueDate < now && !note.completed;

        let dueDateText = `**Due:** ${formatDate(note.dueDate)}`;
        if (isOverdue) {
            dueDateText += ' ⚠️ *Overdue*';
        } else if (!note.completed) {
            const timeDiff = dueDate.getTime() - now.getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            if (daysDiff <= 1) {
                dueDateText += ' 🕐 *Due soon*';
            }
        }

        datesValue.push(dueDateText);
    }

    embed.addFields({
        name: 'Dates',
        value: datesValue.join('\n'),
        inline: true
    });

    // Note ID for reference
    embed.setFooter({
        text: `Note ID: ${note.id}`
    });

    return embed;
}

/**
 * Creates an embed for successful note operations
 * @param {string} operation - Operation performed (added, updated, deleted, etc.)
 * @param {Object} note - Note object (if applicable)
 * @returns {EmbedBuilder} Discord embed for success message
 */
function createNoteSuccessEmbed(operation, note = null) {
    const embed = new EmbedBuilder()
        .setColor(NOTES_EMBED_COLORS.SUCCESS)
        .setTimestamp();

    const operationMessages = {
        added: '✅ Note Added Successfully',
        updated: '✅ Note Updated Successfully',
        deleted: '🗑️ Note Deleted Successfully',
        completed: '✅ Note Marked as Completed',
        uncompleted: '↩️ Note Marked as Incomplete',
        cleanup: '🧹 Old Notes Cleaned Up'
    };

    embed.setTitle(operationMessages[operation] || '✅ Operation Successful');

    if (note) {
        const truncatedContent = note.content.length > 100
            ? note.content.substring(0, 97) + '...'
            : note.content;

        embed.setDescription(`**Note:** ${truncatedContent}`);

        if (operation === 'added' && note.dueDate) {
            embed.addFields({
                name: 'Due Date',
                value: formatDate(note.dueDate),
                inline: true
            });
        }
    }

    return embed;
}

/**
 * Creates an embed for note operation errors
 * @param {string} operation - Operation that failed
 * @param {string} error - Error message
 * @returns {EmbedBuilder} Discord embed for error message
 */
function createNoteErrorEmbed(operation, error) {
    return new EmbedBuilder()
        .setTitle('❌ Operation Failed')
        .setDescription(`Failed to ${operation} note.`)
        .setColor(NOTES_EMBED_COLORS.ERROR)
        .addFields({
            name: 'Error',
            value: error,
            inline: false
        })
        .setTimestamp();
}

/**
 * Creates an embed for cleanup operation results
 * @param {number} cleanedCount - Number of notes cleaned up
 * @param {number} daysOld - Number of days threshold used
 * @returns {EmbedBuilder} Discord embed for cleanup results
 */
function createCleanupResultsEmbed(cleanedCount, daysOld = 30) {
    const embed = new EmbedBuilder()
        .setTitle('🧹 Notes Cleanup Complete')
        .setColor(cleanedCount > 0 ? NOTES_EMBED_COLORS.SUCCESS : NOTES_EMBED_COLORS.INFO)
        .setTimestamp();

    if (cleanedCount > 0) {
        embed.setDescription(`Successfully cleaned up ${cleanedCount} old completed note${cleanedCount === 1 ? '' : 's'}.`);
        embed.addFields({
            name: 'Criteria',
            value: `Completed notes older than ${daysOld} days`,
            inline: false
        });
    } else {
        embed.setDescription('No old completed notes found to clean up.');
        embed.addFields({
            name: 'Criteria',
            value: `Would clean completed notes older than ${daysOld} days`,
            inline: false
        });
    }

    return embed;
}

/**
 * Formats a note for display in a list
 * @param {Object} note - Note object
 * @param {number} index - Index number for display
 * @returns {string} Formatted note string
 */
function formatNoteForList(note, index) {
    const status = note.completed ? '✅' : '⏳';

    // Truncate content for list display
    const truncatedContent = note.content.length > 60
        ? note.content.substring(0, 57) + '...'
        : note.content;

    let noteText = `${status} **${index}.** ${truncatedContent}`;

    // Add due date info if present
    if (note.dueDate && !note.completed) {
        const dueDate = new Date(note.dueDate);
        const now = new Date();

        if (dueDate < now) {
            noteText += ' ⚠️ *Overdue*';
        } else {
            const timeDiff = dueDate.getTime() - now.getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            if (daysDiff <= 1) {
                noteText += ' 🕐 *Due today*';
            } else if (daysDiff <= 7) {
                noteText += ` 📅 *Due in ${daysDiff} days*`;
            }
        }
    }

    return noteText;
}

/**
 * Formats a date for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
    if (!dateString) return 'Not set';

    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Formats a due date for display with context
 * @param {string} dueDateString - ISO date string
 * @param {boolean} isCompleted - Whether the note is completed
 * @returns {string} Formatted due date with context
 */
function formatDueDate(dueDateString, isCompleted = false) {
    if (!dueDateString) return null;

    const dueDate = new Date(dueDateString);
    const now = new Date();
    const formatted = formatDate(dueDateString);

    if (isCompleted) {
        return formatted;
    }

    if (dueDate < now) {
        return `${formatted} ⚠️ (Overdue)`;
    }

    const timeDiff = dueDate.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    if (daysDiff <= 1) {
        return `${formatted} 🕐 (Due today)`;
    } else if (daysDiff <= 7) {
        return `${formatted} 📅 (Due in ${daysDiff} days)`;
    }

    return formatted;
}

module.exports = {
    NOTES_EMBED_COLORS,
    createEmptyNotesEmbed,
    createNotesListEmbed,
    createNoteDetailEmbed,
    createNoteSuccessEmbed,
    createNoteErrorEmbed,
    createCleanupResultsEmbed,
    formatNoteForList,
    formatDate,
    formatDueDate
};