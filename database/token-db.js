/**
 * WoW Token Database Service
 *
 * Local SQLite database for storing WoW token price history and user preferences.
 * Tracks token prices over time and user notification settings.
 *
 * Features:
 * - Token price history tracking
 * - User DM preference storage
 * - Guild-wide threshold settings
 * - Efficient indexing for fast queries
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Database configuration
const DB_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'mythic_runs.db'); // Reuse existing database

/**
 * Database schema version for migrations
 */
const TOKEN_SCHEMA_VERSION = 1;

/**
 * TokenDatabase class
 * Manages token price tracking and user preferences
 */
class TokenDatabase {
    constructor() {
        // Ensure data directory exists
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
            logger.info('Created database directory', { path: DB_DIR });
        }

        // Initialize database connection (reuse existing database)
        this.db = new Database(DB_PATH);
        this.db.pragma('journal_mode = WAL');

        logger.info('Token database initialized', {
            path: DB_PATH,
            version: TOKEN_SCHEMA_VERSION
        });

        // Initialize schema
        this.initializeSchema();
    }

    /**
     * Initialize database schema for token tracking
     * Creates tables and indexes if they don't exist
     */
    initializeSchema() {
        try {
            // Enable foreign keys
            this.db.pragma('foreign_keys = ON');

            // Create token_schema_info table for versioning
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS token_schema_info (
                    version INTEGER PRIMARY KEY,
                    applied_at INTEGER NOT NULL
                )
            `);

            // Check current schema version
            const currentVersion = this.db.prepare(
                'SELECT version FROM token_schema_info ORDER BY version DESC LIMIT 1'
            ).get();

            if (!currentVersion || currentVersion.version < TOKEN_SCHEMA_VERSION) {
                this.runMigrations(currentVersion?.version || 0);
            }

            logger.info('Token database schema initialized', {
                currentVersion: TOKEN_SCHEMA_VERSION
            });

        } catch (error) {
            logger.error('Failed to initialize token database schema', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Run database migrations for token tables
     * @param {number} fromVersion - Current schema version
     */
    runMigrations(fromVersion) {
        logger.info('Running token database migrations', {
            from: fromVersion,
            to: TOKEN_SCHEMA_VERSION
        });

        // Migration 0 -> 1: Initial schema
        if (fromVersion < 1) {
            // Create tables and indexes
            this.db.exec(`
                -- Token price history table
                CREATE TABLE IF NOT EXISTS token_prices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    price INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    recorded_at INTEGER NOT NULL,
                    UNIQUE(timestamp)
                );

                -- Token threshold settings (guild-wide)
                CREATE TABLE IF NOT EXISTS token_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    threshold INTEGER NOT NULL DEFAULT 500000,
                    updated_at INTEGER NOT NULL
                );

                -- User DM preferences
                CREATE TABLE IF NOT EXISTS token_user_preferences (
                    user_id TEXT PRIMARY KEY,
                    dm_enabled BOOLEAN NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                -- Indexes for fast queries
                CREATE INDEX IF NOT EXISTS idx_token_prices_timestamp ON token_prices(recorded_at DESC);
                CREATE INDEX IF NOT EXISTS idx_token_user_prefs_enabled ON token_user_preferences(dm_enabled);
            `);

            // Initialize default threshold with prepared statement
            this.db.prepare(
                'INSERT INTO token_settings (id, threshold, updated_at) VALUES (1, 500000, ?) ON CONFLICT(id) DO NOTHING'
            ).run(Date.now());

            // Record schema version
            this.db.prepare(
                'INSERT INTO token_schema_info (version, applied_at) VALUES (?, ?)'
            ).run(1, Date.now());

            logger.info('Token migration 0 -> 1 completed');
        }
    }

    /**
     * Insert token price
     * @param {number} price - Token price in gold
     * @param {string} timestamp - ISO timestamp from API
     * @returns {boolean} True if inserted, false if duplicate
     */
    insertPrice(price, timestamp) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO token_prices (price, timestamp, recorded_at)
                VALUES (?, ?, ?)
                ON CONFLICT(timestamp) DO NOTHING
            `);

            const result = stmt.run(price, timestamp, Date.now());
            return result.changes > 0;

        } catch (error) {
            logger.error('Failed to insert token price', {
                price,
                timestamp,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get the most recent token price
     * @returns {Object|null} Most recent price entry or null
     */
    getLatestPrice() {
        try {
            const stmt = this.db.prepare(`
                SELECT price, timestamp, recorded_at
                FROM token_prices
                ORDER BY recorded_at DESC
                LIMIT 1
            `);

            return stmt.get() || null;

        } catch (error) {
            logger.error('Failed to get latest token price', {
                error: error.message
            });
            return null;
        }
    }

    /**
     * Get token price history
     * @param {number} limit - Number of entries to retrieve
     * @returns {Array} Array of price entries
     */
    getPriceHistory(limit = 100) {
        try {
            const stmt = this.db.prepare(`
                SELECT price, timestamp, recorded_at
                FROM token_prices
                ORDER BY recorded_at DESC
                LIMIT ?
            `);

            return stmt.all(limit);

        } catch (error) {
            logger.error('Failed to get token price history', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Get the current threshold setting
     * @returns {number} Current threshold in gold
     */
    getThreshold() {
        try {
            const stmt = this.db.prepare(`
                SELECT threshold
                FROM token_settings
                WHERE id = 1
            `);

            const result = stmt.get();
            return result?.threshold || 500000;

        } catch (error) {
            logger.error('Failed to get token threshold', {
                error: error.message
            });
            return 500000; // Default fallback
        }
    }

    /**
     * Set the threshold setting
     * @param {number} threshold - New threshold in gold
     * @returns {boolean} True if successful
     */
    setThreshold(threshold) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO token_settings (id, threshold, updated_at)
                VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    threshold = excluded.threshold,
                    updated_at = excluded.updated_at
            `);

            stmt.run(threshold, Date.now());
            return true;

        } catch (error) {
            logger.error('Failed to set token threshold', {
                threshold,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get user DM preference
     * @param {string} userId - Discord user ID
     * @returns {boolean} True if DMs are enabled
     */
    getUserDMEnabled(userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT dm_enabled
                FROM token_user_preferences
                WHERE user_id = ?
            `);

            const result = stmt.get(userId);
            return result ? Boolean(result.dm_enabled) : false;

        } catch (error) {
            logger.error('Failed to get user DM preference', {
                userId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Set user DM preference
     * @param {string} userId - Discord user ID
     * @param {boolean} enabled - Whether DMs should be enabled
     * @returns {boolean} True if successful
     */
    setUserDMEnabled(userId, enabled) {
        try {
            const now = Date.now();
            const stmt = this.db.prepare(`
                INSERT INTO token_user_preferences (user_id, dm_enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    dm_enabled = excluded.dm_enabled,
                    updated_at = excluded.updated_at
            `);

            stmt.run(userId, enabled ? 1 : 0, now, now);
            return true;

        } catch (error) {
            logger.error('Failed to set user DM preference', {
                userId,
                enabled,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get all users with DMs enabled
     * @returns {Array<string>} Array of user IDs
     */
    getUsersWithDMEnabled() {
        try {
            const stmt = this.db.prepare(`
                SELECT user_id
                FROM token_user_preferences
                WHERE dm_enabled = 1
            `);

            const results = stmt.all();
            return results.map(row => row.user_id);

        } catch (error) {
            logger.error('Failed to get users with DM enabled', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Get statistics
     * @returns {Object} Database statistics
     */
    getStats() {
        try {
            const stats = {
                total_prices: this.db.prepare('SELECT COUNT(*) as count FROM token_prices').get().count,
                latest_price: this.getLatestPrice(),
                threshold: this.getThreshold(),
                users_with_dm: this.db.prepare(
                    'SELECT COUNT(*) as count FROM token_user_preferences WHERE dm_enabled = 1'
                ).get().count
            };

            return stats;

        } catch (error) {
            logger.error('Failed to get token database stats', {
                error: error.message
            });
            return {};
        }
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            logger.info('Token database connection closed');
        }
    }
}

// Export singleton instance
let tokenDbInstance = null;

module.exports = {
    /**
     * Get token database instance (singleton)
     * @returns {TokenDatabase}
     */
    getTokenDatabase() {
        if (!tokenDbInstance) {
            tokenDbInstance = new TokenDatabase();
        }
        return tokenDbInstance;
    },

    /**
     * Close token database connection
     */
    closeTokenDatabase() {
        if (tokenDbInstance) {
            tokenDbInstance.close();
            tokenDbInstance = null;
        }
    }
};
