/**
 * Custom Logging Utility for DaeBot
 *
 * Provides structured logging with different levels and automatic file rotation.
 * Logs are written to both console and rotating log files for persistence.
 *
 * Features:
 * - Multiple log levels (ERROR, WARN, INFO, DEBUG)
 * - Automatic file rotation based on date
 * - Structured JSON logging for easier parsing
 * - Console output with color coding
 * - Performance tracking for API calls
 * - Command usage tracking
 */

const fs = require('fs');
const path = require('path');

/**
 * Log levels with numeric values for filtering
 */
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

/**
 * ANSI color codes for console output
 */
const COLORS = {
    ERROR: '\x1b[31m',   // Red
    WARN: '\x1b[33m',    // Yellow
    INFO: '\x1b[36m',    // Cyan
    DEBUG: '\x1b[37m',   // White
    RESET: '\x1b[0m'     // Reset
};

/**
 * Logger class for handling all logging operations
 */
class Logger {
    constructor() {
        // Create logs directory if it doesn't exist
        // When running in pkg, use AppData directory instead of snapshot
        if (process.pkg) {
            // Running inside pkg - use AppData
            const appDataDir = process.env.APPDATA || process.env.HOME || process.cwd();
            this.logsDir = path.join(appDataDir, 'com.daebot.app', 'logs');
        } else {
            // Running normally - use project directory
            this.logsDir = path.join(__dirname, '../logs');
        }

        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }

        // Set default log level from environment or INFO
        this.logLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

        // Track current log file date for rotation
        this.currentLogDate = this.getCurrentDateString();
        this.logFilePath = this.getLogFilePath();

        // Initialize log file with startup message
        this.info('Logger initialized', {
            logLevel: Object.keys(LOG_LEVELS)[this.logLevel],
            logFile: this.logFilePath
        });
    }

    /**
     * Gets current date string for log file naming
     * @returns {string} Date string in YYYY-MM-DD format
     */
    getCurrentDateString() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Gets the log file path for the current date
     * @returns {string} Full path to current log file
     */
    getLogFilePath() {
        return path.join(this.logsDir, `daebot-${this.getCurrentDateString()}.log`);
    }

    /**
     * Rotates log file if date has changed
     */
    rotateLogIfNeeded() {
        const currentDate = this.getCurrentDateString();
        if (currentDate !== this.currentLogDate) {
            this.currentLogDate = currentDate;
            this.logFilePath = this.getLogFilePath();
            this.info('Log file rotated', { newFile: this.logFilePath });
        }
    }

    /**
     * Formats log message with timestamp and metadata
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     * @returns {Object} Formatted log entry
     */
    formatLogEntry(level, message, metadata = {}) {
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...metadata
        };
    }

    /**
     * Writes log entry to file and console
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    writeLog(level, message, metadata = {}) {
        // Check if this log level should be output
        if (LOG_LEVELS[level] > this.logLevel) {
            return;
        }

        // Rotate log file if needed
        this.rotateLogIfNeeded();

        // Format the log entry
        const logEntry = this.formatLogEntry(level, message, metadata);

        // Write to file
        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            fs.appendFileSync(this.logFilePath, logLine);
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }

        // Write to console with color coding
        const color = COLORS[level] || COLORS.INFO;
        const timestamp = new Date().toISOString().substring(11, 19); // HH:MM:SS format
        const metadataStr = Object.keys(metadata).length > 0 ? ` | ${JSON.stringify(metadata)}` : '';

        console.log(`${color}[${timestamp}] ${level}: ${message}${metadataStr}${COLORS.RESET}`);

        // Forward to Electron GUI if available
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            try {
                global.mainWindow.webContents.send('log-entry', {
                    timestamp: logEntry.timestamp,
                    level: level.toLowerCase(),
                    message: message
                });
            } catch (error) {
                // Silently fail if GUI is not available
            }
        }
    }

    /**
     * Log error messages
     * @param {string} message - Error message
     * @param {Object} metadata - Additional error context
     */
    error(message, metadata = {}) {
        this.writeLog('ERROR', message, metadata);
    }

    /**
     * Log warning messages
     * @param {string} message - Warning message
     * @param {Object} metadata - Additional warning context
     */
    warn(message, metadata = {}) {
        this.writeLog('WARN', message, metadata);
    }

    /**
     * Log informational messages
     * @param {string} message - Info message
     * @param {Object} metadata - Additional info context
     */
    info(message, metadata = {}) {
        this.writeLog('INFO', message, metadata);
    }

    /**
     * Log debug messages
     * @param {string} message - Debug message
     * @param {Object} metadata - Additional debug context
     */
    debug(message, metadata = {}) {
        this.writeLog('DEBUG', message, metadata);
    }

    /**
     * Log success messages
     * @param {string} message - Success message
     * @param {Object} metadata - Additional success context
     */
    success(message, metadata = {}) {
        this.writeLog('INFO', message, metadata); // Use INFO level but mark as success
    }

    /**
     * Log Discord command usage
     * @param {string} commandName - Name of the command
     * @param {Object} user - Discord user object
     * @param {string} guildId - Discord guild ID
     * @param {Object} options - Command options/parameters
     * @param {boolean} success - Whether command succeeded
     * @param {number} duration - Command execution duration in ms
     */
    logCommand(commandName, user, guildId, options = {}, success = true, duration = null) {
        const metadata = {
            command: commandName,
            userId: user.id,
            username: user.tag,
            guildId,
            options,
            success,
            duration
        };

        if (success) {
            this.info(`Command executed: /${commandName}`, metadata);
        } else {
            this.warn(`Command failed: /${commandName}`, metadata);
        }
    }

    /**
     * Log API call performance and results
     * @param {string} apiName - Name of the API (e.g., 'RaiderIO')
     * @param {string} endpoint - API endpoint called
     * @param {number} duration - Request duration in ms
     * @param {boolean} success - Whether request succeeded
     * @param {number} statusCode - HTTP status code
     * @param {Object} metadata - Additional API call context
     */
    logApiCall(apiName, endpoint, duration, success, statusCode, metadata = {}) {
        const logData = {
            api: apiName,
            endpoint,
            duration,
            success,
            statusCode,
            ...metadata
        };

        if (success) {
            this.info(`API call successful: ${apiName}`, logData);
        } else {
            this.warn(`API call failed: ${apiName}`, logData);
        }
    }

    /**
     * Log cache operations for debugging cache performance
     * @param {string} operation - Cache operation (HIT, MISS, SET, DELETE)
     * @param {string} key - Cache key
     * @param {Object} metadata - Additional cache context
     */
    logCache(operation, key, metadata = {}) {
        this.debug(`Cache ${operation}: ${key}`, metadata);
    }

    /**
     * Log configuration changes
     * @param {string} action - Action performed (ADD, REMOVE, MODIFY)
     * @param {string} target - What was changed
     * @param {Object} user - Discord user who made the change
     * @param {Object} metadata - Additional change context
     */
    logConfigChange(action, target, user, metadata = {}) {
        const logData = {
            action,
            target,
            userId: user.id,
            username: user.tag,
            ...metadata
        };

        this.info(`Config change: ${action} ${target}`, logData);
    }

    /**
     * Log Discord bot events (ready, disconnect, etc.)
     * @param {string} event - Discord event name
     * @param {Object} metadata - Event context
     */
    logBotEvent(event, metadata = {}) {
        this.info(`Bot event: ${event}`, metadata);
    }

    /**
     * Get log file statistics for monitoring
     * @returns {Object} Log statistics
     */
    getLogStats() {
        try {
            const stats = fs.statSync(this.logFilePath);
            return {
                currentLogFile: path.basename(this.logFilePath),
                fileSize: stats.size,
                lastModified: stats.mtime,
                totalLogFiles: fs.readdirSync(this.logsDir).filter(f => f.endsWith('.log')).length
            };
        } catch (error) {
            return {
                error: 'Unable to get log statistics',
                details: error.message
            };
        }
    }
}

// Create singleton logger instance
const logger = new Logger();

module.exports = logger;