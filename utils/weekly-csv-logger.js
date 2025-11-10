/**
 * Weekly CSV Logger for Mythic+ Data
 *
 * Creates CSV files containing weekly M+ run data for all characters.
 * Provides backup data and enables easy spreadsheet analysis.
 *
 * Features:
 * - Weekly CSV files with character M+ data
 * - Automatic file rotation based on WoW weekly reset
 * - Comprehensive run details (dungeon, level, score, timing)
 * - Character progression tracking
 * - Backup data source for analysis
 */

const fs = require('fs');
const path = require('path');
const weeklyHelper = require('../helpers/weekly');
const logger = require('./logger');
const { getCsvLogsPath } = require('./app-paths');

/**
 * Weekly CSV Logger class for M+ data persistence
 */
class WeeklyCsvLogger {
    constructor() {
        // Use centralized app-paths utility to determine correct CSV logs directory
        this.csvLogsDir = getCsvLogsPath();

        if (!fs.existsSync(this.csvLogsDir)) {
            fs.mkdirSync(this.csvLogsDir, { recursive: true });
        }

        // Track current weekly reset for file naming
        this.currentReset = weeklyHelper.getLastTuesdayReset();
        this.csvFilePath = this.getCsvFilePath();

        logger.info('Weekly CSV logger initialized', {
            csvDir: this.csvLogsDir,
            currentResetFile: path.basename(this.csvFilePath)
        });
    }

    /**
     * Gets the CSV file path for the current weekly reset
     * @returns {string} Full path to current weekly CSV file
     */
    getCsvFilePath() {
        const resetDate = this.currentReset.toISOString().split('T')[0]; // YYYY-MM-DD
        return path.join(this.csvLogsDir, `weekly-mplus-${resetDate}.csv`);
    }

    /**
     * Checks if weekly reset has occurred and rotates file if needed
     */
    checkAndRotateFile() {
        const latestReset = weeklyHelper.getLastTuesdayReset();

        if (latestReset.getTime() !== this.currentReset.getTime()) {
            this.currentReset = latestReset;
            this.csvFilePath = this.getCsvFilePath();

            logger.info('Weekly CSV file rotated for new reset', {
                newResetFile: path.basename(this.csvFilePath)
            });
        }
    }

    /**
     * Creates CSV header row if file doesn't exist
     */
    ensureCsvHeader() {
        if (!fs.existsSync(this.csvFilePath)) {
            const header = [
                'Timestamp',
                'Character_Name',
                'Character_Class',
                'Character_Role',
                'Overall_Score',
                'Highest_Key_Level',
                'Total_Weekly_Runs',
                'Dungeon_Name',
                'Key_Level',
                'Run_Score',
                'Timed_Status',
                'Keystone_Upgrades',
                'Completion_Date',
                'Weekly_Reset_Date'
            ].join(',');

            fs.writeFileSync(this.csvFilePath, header + '\n');
            logger.info('Created new weekly CSV file with header', {
                filePath: path.basename(this.csvFilePath)
            });
        }
    }

    /**
     * Sanitizes CSV data to prevent injection and formatting issues
     * @param {string} value - Value to sanitize
     * @returns {string} Sanitized value safe for CSV
     */
    sanitizeCsvValue(value) {
        if (value === null || value === undefined) {
            return '';
        }

        const stringValue = String(value);

        // Escape quotes and wrap in quotes if contains special characters
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }

        return stringValue;
    }

    /**
     * Converts character M+ data to CSV rows
     * @param {Array} charactersData - Array of character objects with M+ data
     * @returns {Array} Array of CSV row strings
     */
    convertToCSVRows(charactersData) {
        const rows = [];
        const timestamp = new Date().toISOString();
        const resetDate = this.currentReset.toISOString().split('T')[0];

        charactersData.forEach(character => {
            if (!character.recent_runs || character.recent_runs.length === 0) {
                // Add row for character with no runs
                const row = [
                    timestamp,
                    this.sanitizeCsvValue(character.name),
                    this.sanitizeCsvValue(character.class),
                    this.sanitizeCsvValue(character.role),
                    this.sanitizeCsvValue(character.mythic_plus_scores?.overall || 0),
                    0, // Highest key level
                    0, // Total weekly runs
                    '', // No dungeon
                    '', // No key level
                    '', // No score
                    '', // No timing
                    '', // No upgrades
                    '', // No completion date
                    resetDate
                ].join(',');

                rows.push(row);
                return;
            }

            // Filter runs to current week only
            const weeklyRuns = character.recent_runs.filter(run => {
                const runDate = new Date(run.completed_at);
                return runDate >= this.currentReset;
            });

            // Calculate character summary stats
            const overallScore = character.mythic_plus_scores?.overall || 0;
            const highestKeyLevel = weeklyRuns.length > 0 ?
                Math.max(...weeklyRuns.map(r => r.mythic_level)) : 0;
            const totalWeeklyRuns = weeklyRuns.length;

            if (weeklyRuns.length === 0) {
                // Character has runs in recent_runs but none this week
                const row = [
                    timestamp,
                    this.sanitizeCsvValue(character.name),
                    this.sanitizeCsvValue(character.class),
                    this.sanitizeCsvValue(character.role),
                    overallScore,
                    0, // No keys this week
                    0, // No runs this week
                    '', // No dungeon
                    '', // No key level
                    '', // No score
                    '', // No timing
                    '', // No upgrades
                    '', // No completion date
                    resetDate
                ].join(',');

                rows.push(row);
                return;
            }

            // Add row for each weekly run
            weeklyRuns.forEach(run => {
                const timedStatus = run.num_keystone_upgrades > 0 ? 'Timed' : 'Untimed';
                const completionDate = new Date(run.completed_at).toISOString().split('T')[0];

                const row = [
                    timestamp,
                    this.sanitizeCsvValue(character.name),
                    this.sanitizeCsvValue(character.class),
                    this.sanitizeCsvValue(character.role),
                    overallScore,
                    highestKeyLevel,
                    totalWeeklyRuns,
                    this.sanitizeCsvValue(run.dungeon),
                    run.mythic_level,
                    run.score || 0,
                    timedStatus,
                    run.num_keystone_upgrades,
                    completionDate,
                    resetDate
                ].join(',');

                rows.push(row);
            });
        });

        return rows;
    }

    /**
     * Reads existing CSV data to check for duplicates
     * @returns {Set} Set of unique row signatures for duplicate detection
     */
    getExistingRowSignatures() {
        try {
            if (!fs.existsSync(this.csvFilePath)) {
                return new Set();
            }

            const content = fs.readFileSync(this.csvFilePath, 'utf8');
            const lines = content.split('\n').slice(1); // Skip header
            const signatures = new Set();

            lines.forEach(line => {
                if (line.trim()) {
                    // Create signature from character name, dungeon, key level, completion date
                    const columns = line.split(',');
                    if (columns.length >= 12) {
                        const signature = `${columns[1]}|${columns[7]}|${columns[8]}|${columns[11]}`; // char|dungeon|level|date
                        signatures.add(signature);
                    }
                }
            });

            return signatures;
        } catch (error) {
            logger.warn('Failed to read existing CSV for duplicate detection', { error: error.message });
            return new Set();
        }
    }

    /**
     * Logs weekly M+ data to CSV file, avoiding duplicates
     * @param {Array} charactersData - Array of character objects with M+ data
     * @param {Object} options - Logging options
     */
    logWeeklyData(charactersData, options = {}) {
        try {
            // Check for weekly reset and rotate file if needed
            this.checkAndRotateFile();

            // Ensure CSV file exists with proper header
            this.ensureCsvHeader();

            // Get existing row signatures to avoid duplicates
            const existingSignatures = this.getExistingRowSignatures();

            // Convert character data to CSV rows
            const allCsvRows = this.convertToCSVRows(charactersData);

            if (allCsvRows.length === 0) {
                logger.warn('No CSV data to log for weekly M+ data');
                return;
            }

            // Filter out duplicate rows
            const newRows = allCsvRows.filter(row => {
                const columns = row.split(',');
                if (columns.length >= 12) {
                    // Create signature for this row
                    const signature = `${columns[1]}|${columns[7]}|${columns[8]}|${columns[11]}`; // char|dungeon|level|date
                    return !existingSignatures.has(signature);
                }
                return true; // Include rows that don't match expected format (shouldn't happen)
            });

            if (newRows.length === 0) {
                logger.info('No new M+ data to add to CSV (no duplicates added)', {
                    fileName: path.basename(this.csvFilePath),
                    totalRowsProcessed: allCsvRows.length,
                    characterCount: charactersData.length
                });
                return;
            }

            // Append only new rows to CSV file
            const csvContent = newRows.join('\n') + '\n';
            fs.appendFileSync(this.csvFilePath, csvContent);

            logger.info('Successfully logged new weekly M+ data to CSV', {
                fileName: path.basename(this.csvFilePath),
                newRowCount: newRows.length,
                totalRowsProcessed: allCsvRows.length,
                duplicatesSkipped: allCsvRows.length - newRows.length,
                characterCount: charactersData.length,
                resetDate: this.currentReset.toISOString().split('T')[0]
            });

        } catch (error) {
            logger.error('Failed to log weekly M+ data to CSV', {
                error: error.message,
                stack: error.stack,
                filePath: this.csvFilePath
            });
        }
    }

    /**
     * Gets statistics about CSV log files
     * @returns {Object} CSV log statistics
     */
    getLogStats() {
        try {
            const csvFiles = fs.readdirSync(this.csvLogsDir)
                .filter(f => f.startsWith('weekly-mplus-') && f.endsWith('.csv'))
                .sort();

            const stats = {
                totalFiles: csvFiles.length,
                currentFile: path.basename(this.csvFilePath),
                oldestFile: csvFiles[0] || null,
                newestFile: csvFiles[csvFiles.length - 1] || null,
                fileList: csvFiles
            };

            // Get current file size if it exists
            if (fs.existsSync(this.csvFilePath)) {
                const fileStat = fs.statSync(this.csvFilePath);
                stats.currentFileSize = fileStat.size;
                stats.currentFileLines = this.countFileLines(this.csvFilePath);
            }

            return stats;

        } catch (error) {
            logger.error('Failed to get CSV log stats', { error: error.message });
            return {
                error: 'Unable to get CSV statistics',
                details: error.message
            };
        }
    }

    /**
     * Counts the number of lines in a file
     * @param {string} filePath - Path to file
     * @returns {number} Number of lines in file
     */
    countFileLines(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return content.split('\n').length - 1; // Subtract 1 for final newline
        } catch (error) {
            return 0;
        }
    }

    /**
     * Manually triggers a CSV log rotation (useful for testing)
     */
    forceRotation() {
        const oldFile = path.basename(this.csvFilePath);
        this.currentReset = weeklyHelper.getLastTuesdayReset();
        this.csvFilePath = this.getCsvFilePath();

        logger.info('Forced CSV file rotation', {
            oldFile,
            newFile: path.basename(this.csvFilePath)
        });
    }

    /**
     * Cleans up old CSV files (keeps last N weeks)
     * @param {number} weeksToKeep - Number of weeks of CSV files to retain
     */
    cleanupOldFiles(weeksToKeep = 12) {
        try {
            const csvFiles = fs.readdirSync(this.csvLogsDir)
                .filter(f => f.startsWith('weekly-mplus-') && f.endsWith('.csv'))
                .sort();

            if (csvFiles.length <= weeksToKeep) {
                return; // No cleanup needed
            }

            const filesToDelete = csvFiles.slice(0, csvFiles.length - weeksToKeep);
            let deletedCount = 0;

            filesToDelete.forEach(fileName => {
                try {
                    fs.unlinkSync(path.join(this.csvLogsDir, fileName));
                    deletedCount++;
                } catch (error) {
                    logger.warn('Failed to delete old CSV file', { fileName, error: error.message });
                }
            });

            if (deletedCount > 0) {
                logger.info('Cleaned up old CSV files', {
                    deletedCount,
                    remainingFiles: csvFiles.length - deletedCount,
                    weeksRetained: weeksToKeep
                });
            }

        } catch (error) {
            logger.error('Failed to cleanup old CSV files', { error: error.message });
        }
    }
}

// Create singleton instance
const weeklyCsvLogger = new WeeklyCsvLogger();

module.exports = weeklyCsvLogger;