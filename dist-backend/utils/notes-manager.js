/**
 * Notes Manager Utility
 * Handles local storage and management of guild-specific notes/todos
 * Provides CRUD operations with JSON file persistence
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Notes Manager class for handling note storage and operations
 */
class NotesManager {
    constructor() {
        // Create data directory if it doesn't exist
        // When running in pkg, use AppData directory instead of snapshot
        if (process.pkg) {
            const appDataDir = process.env.APPDATA || process.env.HOME || process.cwd();
            this.dataDir = path.join(appDataDir, 'com.daebot.app', 'data');
        } else {
            this.dataDir = path.join(__dirname, '../data');
        }
        this.notesFilePath = path.join(this.dataDir, 'notes.json');

        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        // Initialize notes file if it doesn't exist
        this.initializeNotesFile();

        logger.info('Notes manager initialized', {
            dataDir: this.dataDir,
            notesFile: path.basename(this.notesFilePath)
        });
    }

    /**
     * Initializes the notes JSON file with empty structure if it doesn't exist
     */
    initializeNotesFile() {
        if (!fs.existsSync(this.notesFilePath)) {
            const initialData = {
                version: '1.0.0',
                guilds: {}
            };

            fs.writeFileSync(this.notesFilePath, JSON.stringify(initialData, null, 2));
            logger.info('Created new notes data file', { filePath: this.notesFilePath });
        }
    }

    /**
     * Loads notes data from JSON file
     * @returns {Object} Notes data structure
     */
    loadNotesData() {
        try {
            const data = fs.readFileSync(this.notesFilePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('Failed to load notes data', { error: error.message });
            // Return default structure on error
            return {
                version: '1.0.0',
                guilds: {}
            };
        }
    }

    /**
     * Saves notes data to JSON file
     * @param {Object} data - Notes data structure to save
     */
    saveNotesData(data) {
        try {
            fs.writeFileSync(this.notesFilePath, JSON.stringify(data, null, 2));
        } catch (error) {
            logger.error('Failed to save notes data', { error: error.message });
            throw new Error('Unable to save notes data');
        }
    }

    /**
     * Generates a unique ID for a new note
     * @returns {string} Unique note ID
     */
    generateNoteId() {
        return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Gets all notes for a specific guild
     * @param {string} guildId - Discord guild ID
     * @returns {Array} Array of note objects
     */
    getGuildNotes(guildId) {
        const data = this.loadNotesData();

        if (!data.guilds[guildId]) {
            data.guilds[guildId] = { notes: [] };
            this.saveNotesData(data);
        }

        return data.guilds[guildId].notes || [];
    }

    /**
     * Adds a new note for a guild
     * @param {string} guildId - Discord guild ID
     * @param {string} content - Note content
     * @param {string} userId - User who created the note
     * @param {Date|null} dueDate - Optional due date
     * @returns {Object} Created note object
     */
    addNote(guildId, content, userId, dueDate = null) {
        const data = this.loadNotesData();

        if (!data.guilds[guildId]) {
            data.guilds[guildId] = { notes: [] };
        }

        const note = {
            id: this.generateNoteId(),
            content: content.trim(),
            createdAt: new Date().toISOString(),
            createdBy: userId,
            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
            completed: false,
            completedAt: null,
            completedBy: null
        };

        data.guilds[guildId].notes.push(note);
        this.saveNotesData(data);

        logger.info('Note added', {
            guildId,
            noteId: note.id,
            userId,
            hasDueDate: !!dueDate
        });

        return note;
    }

    /**
     * Updates an existing note
     * @param {string} guildId - Discord guild ID
     * @param {string} noteId - Note ID to update
     * @param {Object} updates - Object containing fields to update
     * @returns {Object|null} Updated note object or null if not found
     */
    updateNote(guildId, noteId, updates) {
        const data = this.loadNotesData();

        if (!data.guilds[guildId] || !data.guilds[guildId].notes) {
            return null;
        }

        const noteIndex = data.guilds[guildId].notes.findIndex(note => note.id === noteId);
        if (noteIndex === -1) {
            return null;
        }

        const note = data.guilds[guildId].notes[noteIndex];

        // Apply updates
        if (updates.content !== undefined) {
            note.content = updates.content.trim();
        }
        if (updates.dueDate !== undefined) {
            note.dueDate = updates.dueDate ? new Date(updates.dueDate).toISOString() : null;
        }
        if (updates.completed !== undefined) {
            note.completed = updates.completed;
            if (updates.completed) {
                note.completedAt = new Date().toISOString();
                note.completedBy = updates.completedBy || null;
            } else {
                note.completedAt = null;
                note.completedBy = null;
            }
        }

        data.guilds[guildId].notes[noteIndex] = note;
        this.saveNotesData(data);

        logger.info('Note updated', {
            guildId,
            noteId,
            updates: Object.keys(updates)
        });

        return note;
    }

    /**
     * Deletes a note
     * @param {string} guildId - Discord guild ID
     * @param {string} noteId - Note ID to delete
     * @returns {boolean} True if note was deleted, false if not found
     */
    deleteNote(guildId, noteId) {
        const data = this.loadNotesData();

        if (!data.guilds[guildId] || !data.guilds[guildId].notes) {
            return false;
        }

        const initialLength = data.guilds[guildId].notes.length;
        data.guilds[guildId].notes = data.guilds[guildId].notes.filter(note => note.id !== noteId);

        if (data.guilds[guildId].notes.length < initialLength) {
            this.saveNotesData(data);
            logger.info('Note deleted', { guildId, noteId });
            return true;
        }

        return false;
    }

    /**
     * Marks a note as completed
     * @param {string} guildId - Discord guild ID
     * @param {string} noteId - Note ID to complete
     * @param {string} userId - User who completed the note
     * @returns {Object|null} Updated note object or null if not found
     */
    completeNote(guildId, noteId, userId) {
        return this.updateNote(guildId, noteId, {
            completed: true,
            completedBy: userId
        });
    }

    /**
     * Marks a note as incomplete
     * @param {string} guildId - Discord guild ID
     * @param {string} noteId - Note ID to mark incomplete
     * @returns {Object|null} Updated note object or null if not found
     */
    uncompleteNote(guildId, noteId) {
        return this.updateNote(guildId, noteId, {
            completed: false
        });
    }

    /**
     * Gets notes filtered by completion status
     * @param {string} guildId - Discord guild ID
     * @param {boolean} completed - Filter by completion status
     * @returns {Array} Filtered array of note objects
     */
    getFilteredNotes(guildId, completed = false) {
        const notes = this.getGuildNotes(guildId);
        return notes.filter(note => note.completed === completed);
    }

    /**
     * Gets overdue notes (past due date and not completed)
     * @param {string} guildId - Discord guild ID
     * @returns {Array} Array of overdue note objects
     */
    getOverdueNotes(guildId) {
        const notes = this.getGuildNotes(guildId);
        const now = new Date();

        return notes.filter(note => {
            if (note.completed || !note.dueDate) {
                return false;
            }
            return new Date(note.dueDate) < now;
        });
    }

    /**
     * Gets statistics about guild notes
     * @param {string} guildId - Discord guild ID
     * @returns {Object} Statistics object
     */
    getNotesStats(guildId) {
        const notes = this.getGuildNotes(guildId);
        const now = new Date();

        const stats = {
            total: notes.length,
            completed: notes.filter(note => note.completed).length,
            pending: notes.filter(note => !note.completed).length,
            overdue: 0,
            dueSoon: 0 // Due within 24 hours
        };

        const pendingNotes = notes.filter(note => !note.completed);

        pendingNotes.forEach(note => {
            if (note.dueDate) {
                const dueDate = new Date(note.dueDate);
                const timeDiff = dueDate.getTime() - now.getTime();
                const hoursDiff = timeDiff / (1000 * 60 * 60);

                if (hoursDiff < 0) {
                    stats.overdue++;
                } else if (hoursDiff <= 24) {
                    stats.dueSoon++;
                }
            }
        });

        return stats;
    }

    /**
     * Cleans up old completed notes (older than specified days)
     * @param {string} guildId - Discord guild ID
     * @param {number} daysOld - Number of days old to consider for cleanup
     * @returns {number} Number of notes cleaned up
     */
    cleanupOldNotes(guildId, daysOld = 30) {
        const data = this.loadNotesData();

        if (!data.guilds[guildId] || !data.guilds[guildId].notes) {
            return 0;
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const initialLength = data.guilds[guildId].notes.length;

        data.guilds[guildId].notes = data.guilds[guildId].notes.filter(note => {
            if (!note.completed) {
                return true; // Keep all incomplete notes
            }

            const completedDate = new Date(note.completedAt || note.createdAt);
            return completedDate >= cutoffDate;
        });

        const cleanedCount = initialLength - data.guilds[guildId].notes.length;

        if (cleanedCount > 0) {
            this.saveNotesData(data);
            logger.info('Cleaned up old completed notes', {
                guildId,
                cleanedCount,
                daysOld
            });
        }

        return cleanedCount;
    }
}

// Create singleton instance
const notesManager = new NotesManager();

module.exports = notesManager;