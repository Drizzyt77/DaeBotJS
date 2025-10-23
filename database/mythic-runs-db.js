/**
 * Mythic+ Runs Database Service
 *
 * Local SQLite database for storing historical M+ runs with spec information.
 * Allows querying runs by spec, dungeon, character, and time period.
 *
 * Features:
 * - Deduplication using keystone_run_id + completed_timestamp
 * - Spec tracking for each run
 * - Efficient indexing for fast queries
 * - Automatic schema migrations
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Database configuration
const DB_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'mythic_runs.db');

/**
 * Database schema version for migrations
 */
const SCHEMA_VERSION = 3;

/**
 * MythicRunsDatabase class
 * Manages the SQLite database for storing M+ runs
 */
class MythicRunsDatabase {
    constructor() {
        // Ensure data directory exists
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
            logger.info('Created database directory', { path: DB_DIR });
        }

        // Initialize database connection
        this.db = new Database(DB_PATH);
        this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better performance

        logger.info('Mythic+ runs database initialized', {
            path: DB_PATH,
            version: SCHEMA_VERSION
        });

        // Initialize schema
        this.initializeSchema();
    }

    /**
     * Initialize database schema
     * Creates tables and indexes if they don't exist
     */
    initializeSchema() {
        try {
            // Enable foreign keys
            this.db.pragma('foreign_keys = ON');

            // Create schema_info table for versioning
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS schema_info (
                    version INTEGER PRIMARY KEY,
                    applied_at INTEGER NOT NULL
                )
            `);

            // Check current schema version
            const currentVersion = this.db.prepare(
                'SELECT version FROM schema_info ORDER BY version DESC LIMIT 1'
            ).get();

            if (!currentVersion || currentVersion.version < SCHEMA_VERSION) {
                this.runMigrations(currentVersion?.version || 0);
            }

            logger.info('Database schema initialized', {
                currentVersion: SCHEMA_VERSION
            });

        } catch (error) {
            logger.error('Failed to initialize database schema', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Run database migrations
     * @param {number} fromVersion - Current schema version
     */
    runMigrations(fromVersion) {
        logger.info('Running database migrations', {
            from: fromVersion,
            to: SCHEMA_VERSION
        });

        // Migration 0 -> 1: Initial schema
        if (fromVersion < 1) {
            this.db.exec(`
                -- Characters table
                CREATE TABLE IF NOT EXISTS characters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    realm TEXT NOT NULL DEFAULT 'thrall',
                    region TEXT NOT NULL DEFAULT 'us',
                    class TEXT,
                    active_spec_name TEXT,
                    active_spec_role TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE(name, realm, region)
                );

                -- Mythic+ runs table
                CREATE TABLE IF NOT EXISTS mythic_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_id INTEGER NOT NULL,
                    dungeon TEXT NOT NULL,
                    mythic_level INTEGER NOT NULL,
                    completed_timestamp INTEGER NOT NULL,
                    duration INTEGER NOT NULL,
                    keystone_run_id INTEGER,
                    is_completed_within_time BOOLEAN NOT NULL DEFAULT 0,
                    score REAL NOT NULL DEFAULT 0,
                    num_keystone_upgrades INTEGER NOT NULL DEFAULT 0,
                    spec_name TEXT,
                    spec_role TEXT,
                    affixes TEXT,
                    season TEXT,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
                    UNIQUE(character_id, keystone_run_id, completed_timestamp)
                );

                -- Indexes for fast queries
                CREATE INDEX IF NOT EXISTS idx_runs_character ON mythic_runs(character_id);
                CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON mythic_runs(completed_timestamp DESC);
                CREATE INDEX IF NOT EXISTS idx_runs_spec ON mythic_runs(spec_name);
                CREATE INDEX IF NOT EXISTS idx_runs_dungeon ON mythic_runs(dungeon);
                CREATE INDEX IF NOT EXISTS idx_runs_character_spec ON mythic_runs(character_id, spec_name);
                CREATE INDEX IF NOT EXISTS idx_runs_character_dungeon ON mythic_runs(character_id, dungeon);
                CREATE INDEX IF NOT EXISTS idx_runs_season ON mythic_runs(season);
            `);

            // Record schema version
            this.db.prepare(
                'INSERT INTO schema_info (version, applied_at) VALUES (?, ?)'
            ).run(1, Date.now());

            logger.info('Migration 0 -> 1 completed');
        }

        // Migration 1 -> 2: Fix unique constraint for proper deduplication
        if (fromVersion < 2) {
            logger.info('Applying migration 1 -> 2: Fixing unique constraint');

            this.db.exec(`
                -- Create new table with correct unique constraint
                CREATE TABLE mythic_runs_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_id INTEGER NOT NULL,
                    dungeon TEXT NOT NULL,
                    mythic_level INTEGER NOT NULL,
                    completed_timestamp INTEGER NOT NULL,
                    duration INTEGER NOT NULL,
                    keystone_run_id INTEGER,
                    is_completed_within_time BOOLEAN NOT NULL DEFAULT 0,
                    score REAL NOT NULL DEFAULT 0,
                    num_keystone_upgrades INTEGER NOT NULL DEFAULT 0,
                    spec_name TEXT,
                    spec_role TEXT,
                    affixes TEXT,
                    season TEXT,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
                    UNIQUE(character_id, dungeon, mythic_level, completed_timestamp)
                );

                -- Copy unique data from old table (remove duplicates)
                INSERT INTO mythic_runs_new
                SELECT id, character_id, dungeon, mythic_level, completed_timestamp, duration,
                       keystone_run_id, is_completed_within_time, score, num_keystone_upgrades,
                       spec_name, spec_role, affixes, season, created_at
                FROM mythic_runs
                GROUP BY character_id, dungeon, mythic_level, completed_timestamp
                HAVING id = MIN(id);

                -- Drop old table
                DROP TABLE mythic_runs;

                -- Rename new table
                ALTER TABLE mythic_runs_new RENAME TO mythic_runs;

                -- Recreate indexes
                CREATE INDEX idx_runs_character ON mythic_runs(character_id);
                CREATE INDEX idx_runs_timestamp ON mythic_runs(completed_timestamp DESC);
                CREATE INDEX idx_runs_spec ON mythic_runs(spec_name);
                CREATE INDEX idx_runs_dungeon ON mythic_runs(dungeon);
                CREATE INDEX idx_runs_character_spec ON mythic_runs(character_id, spec_name);
                CREATE INDEX idx_runs_character_dungeon ON mythic_runs(character_id, dungeon);
                CREATE INDEX idx_runs_season ON mythic_runs(season);
            `);

            // Record schema version
            this.db.prepare(
                'INSERT INTO schema_info (version, applied_at) VALUES (?, ?)'
            ).run(2, Date.now());

            logger.info('Migration 1 -> 2 completed: Fixed unique constraint for deduplication');
        }

        // Migration 2 -> 3: Add bot_settings table for dynamic configuration
        if (fromVersion < 3) {
            logger.info('Applying migration 2 -> 3: Adding bot_settings table');

            this.db.exec(`
                -- Bot settings table for global configuration
                CREATE TABLE IF NOT EXISTS bot_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    current_season_id INTEGER NOT NULL DEFAULT 15,
                    current_season_name TEXT NOT NULL DEFAULT 'season-tww-3',
                    default_region TEXT NOT NULL DEFAULT 'us',
                    active_dungeons TEXT NOT NULL DEFAULT '[]',
                    updated_at INTEGER NOT NULL
                );
            `);

            // Initialize default settings with current hardcoded values
            const defaultDungeons = JSON.stringify([
                'Ara-Kara, City of Echoes',
                'Eco-Dome Al\'dani',
                'Halls of Atonement',
                'The Dawnbreaker',
                'Priory of the Sacred Flame',
                'Operation: Floodgate',
                'Tazavesh: So\'leah\'s Gambit',
                'Tazavesh: Streets of Wonder'
            ]);

            this.db.prepare(
                'INSERT INTO bot_settings (id, current_season_id, current_season_name, default_region, active_dungeons, updated_at) VALUES (1, 15, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING'
            ).run('season-tww-3', 'us', defaultDungeons, Date.now());

            // Record schema version
            this.db.prepare(
                'INSERT INTO schema_info (version, applied_at) VALUES (?, ?)'
            ).run(3, Date.now());

            logger.info('Migration 2 -> 3 completed: Added bot_settings table with default values');
        }
    }

    /**
     * Upsert a character
     * @param {Object} characterData - Character information
     * @returns {number} Character ID
     */
    upsertCharacter(characterData) {
        const { name, realm = 'thrall', region = 'us', class: charClass, active_spec_name, active_spec_role } = characterData;
        const now = Date.now();

        const stmt = this.db.prepare(`
            INSERT INTO characters (name, realm, region, class, active_spec_name, active_spec_role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name, realm, region) DO UPDATE SET
                class = excluded.class,
                active_spec_name = excluded.active_spec_name,
                active_spec_role = excluded.active_spec_role,
                updated_at = excluded.updated_at
            RETURNING id
        `);

        const result = stmt.get(name, realm, region, charClass, active_spec_name, active_spec_role, now, now);
        return result.id;
    }

    /**
     * Insert a mythic run (with deduplication)
     * @param {number} characterId - Character ID
     * @param {Object} runData - Run information
     * @returns {Object} Insert result with {inserted: boolean, id: number}
     */
    insertRun(characterId, runData) {
        const {
            dungeon,
            mythic_level,
            completed_timestamp,
            duration,
            keystone_run_id,
            is_completed_within_time = false,
            score = 0,
            num_keystone_upgrades = 0,
            spec_name,
            spec_role,
            affixes,
            season
        } = runData;

        const now = Date.now();

        try {
            const stmt = this.db.prepare(`
                INSERT INTO mythic_runs (
                    character_id, dungeon, mythic_level, completed_timestamp, duration,
                    keystone_run_id, is_completed_within_time, score, num_keystone_upgrades,
                    spec_name, spec_role, affixes, season, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(character_id, dungeon, mythic_level, completed_timestamp)
                DO UPDATE SET
                    spec_name = excluded.spec_name,
                    spec_role = excluded.spec_role,
                    score = excluded.score,
                    num_keystone_upgrades = excluded.num_keystone_upgrades,
                    is_completed_within_time = excluded.is_completed_within_time
                WHERE spec_name != excluded.spec_name OR score != excluded.score
            `);

            const result = stmt.run(
                characterId,
                dungeon,
                mythic_level,
                completed_timestamp,
                duration,
                keystone_run_id,
                is_completed_within_time ? 1 : 0,
                score,
                num_keystone_upgrades,
                spec_name,
                spec_role,
                affixes ? JSON.stringify(affixes) : null,
                season,
                now
            );

            // Check if row was inserted or updated
            if (result.changes > 0) {
                return { inserted: true, id: result.lastInsertRowid || null, updated: result.changes === 1 && result.lastInsertRowid === 0 };
            }

            return { inserted: false, id: null };

        } catch (error) {
            logger.error('Failed to insert/update run', {
                characterId,
                dungeon,
                mythic_level,
                spec_name,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get character ID by name
     * @param {string} name - Character name
     * @param {string} realm - Realm (default: 'thrall')
     * @param {string} region - Region (default: 'us')
     * @returns {number|null} Character ID or null if not found
     */
    getCharacterId(name, realm = 'thrall', region = 'us') {
        const stmt = this.db.prepare(`
            SELECT id FROM characters
            WHERE name = ? AND realm = ? AND region = ?
        `);
        const result = stmt.get(name, realm, region);
        return result?.id || null;
    }

    /**
     * Get runs for a character filtered by spec
     * @param {string} characterName - Character name
     * @param {string} specName - Spec name (null for all specs)
     * @param {Object} options - Query options
     * @returns {Array} Array of runs
     */
    getRunsBySpec(characterName, specName = null, options = {}) {
        const {
            realm = 'thrall',
            region = 'us',
            dungeon = null,
            season = null,
            limit = null,
            minLevel = null
        } = options;

        // Build query dynamically
        let query = `
            SELECT
                r.dungeon,
                r.mythic_level,
                r.completed_timestamp,
                r.duration,
                r.is_completed_within_time,
                r.score,
                r.num_keystone_upgrades,
                r.spec_name,
                r.spec_role,
                r.affixes,
                r.season
            FROM mythic_runs r
            INNER JOIN characters c ON r.character_id = c.id
            WHERE c.name = ? AND c.realm = ? AND c.region = ?
        `;

        const params = [characterName, realm, region];

        if (specName) {
            query += ' AND r.spec_name = ?';
            params.push(specName);
        }

        if (dungeon) {
            query += ' AND r.dungeon = ?';
            params.push(dungeon);
        }

        if (season) {
            query += ' AND r.season = ?';
            params.push(season);
        }

        if (minLevel) {
            query += ' AND r.mythic_level >= ?';
            params.push(minLevel);
        }

        query += ' ORDER BY r.completed_timestamp DESC';

        if (limit) {
            query += ' LIMIT ?';
            params.push(limit);
        }

        const stmt = this.db.prepare(query);
        const runs = stmt.all(...params);

        // Parse affixes JSON
        return runs.map(run => ({
            ...run,
            affixes: run.affixes ? JSON.parse(run.affixes) : [],
            is_completed_within_time: Boolean(run.is_completed_within_time)
        }));
    }

    /**
     * Get best run per dungeon for a character and spec
     * @param {string} characterName - Character name
     * @param {string} specName - Spec name (null for all specs)
     * @param {Object} options - Query options
     * @returns {Array} Array of best runs per dungeon
     */
    getBestRunsPerDungeon(characterName, specName = null, options = {}) {
        const {
            realm = 'thrall',
            region = 'us',
            season = null
        } = options;

        // Use a subquery to find the best run for each dungeon by score
        // Best run = highest score (which typically corresponds to highest level + timed bonuses)
        let query = `
            SELECT
                r.dungeon,
                r.mythic_level,
                r.completed_timestamp,
                r.duration,
                r.is_completed_within_time,
                r.score,
                r.num_keystone_upgrades,
                r.spec_name,
                r.spec_role,
                r.affixes,
                r.season
            FROM mythic_runs r
            INNER JOIN characters c ON r.character_id = c.id
            INNER JOIN (
                SELECT
                    r2.dungeon,
                    MAX(r2.score) as max_score
                FROM mythic_runs r2
                INNER JOIN characters c2 ON r2.character_id = c2.id
                WHERE c2.name = ? AND c2.realm = ? AND c2.region = ?
        `;

        const params = [characterName, realm, region];

        if (specName) {
            query += ' AND r2.spec_name = ?';
            params.push(specName);
        }

        if (season) {
            query += ' AND r2.season = ?';
            params.push(season);
        }

        query += `
                GROUP BY r2.dungeon
            ) best ON r.dungeon = best.dungeon AND r.score = best.max_score
            WHERE c.name = ?`;
        params.push(characterName);

        query += ' AND c.realm = ? AND c.region = ?';
        params.push(realm, region);

        if (specName) {
            query += ' AND r.spec_name = ?';
            params.push(specName);
        }

        if (season) {
            query += ' AND r.season = ?';
            params.push(season);
        }

        // Group by dungeon and pick the run with the highest score
        // If there are still duplicates (same score), pick the most recent one
        query += ' GROUP BY r.dungeon HAVING r.completed_timestamp = MAX(r.completed_timestamp) ORDER BY r.score DESC';

        const stmt = this.db.prepare(query);
        const runs = stmt.all(...params);

        return runs.map(run => ({
            ...run,
            affixes: run.affixes ? JSON.parse(run.affixes) : [],
            is_completed_within_time: Boolean(run.is_completed_within_time)
        }));
    }

    /**
     * Get statistics
     * @returns {Object} Database statistics
     */
    getStats() {
        const stats = {
            characters: this.db.prepare('SELECT COUNT(*) as count FROM characters').get().count,
            runs: this.db.prepare('SELECT COUNT(*) as count FROM mythic_runs').get().count,
            latest_run: this.db.prepare(
                'SELECT MAX(completed_timestamp) as timestamp FROM mythic_runs'
            ).get().timestamp,
            db_size: fs.statSync(DB_PATH).size
        };

        return stats;
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            logger.info('Database connection closed');
        }
    }
}

// Export singleton instance
let dbInstance = null;

module.exports = {
    /**
     * Get database instance (singleton)
     * @returns {MythicRunsDatabase}
     */
    getDatabase() {
        if (!dbInstance) {
            dbInstance = new MythicRunsDatabase();
        }
        return dbInstance;
    },

    /**
     * Close database connection
     */
    closeDatabase() {
        if (dbInstance) {
            dbInstance.close();
            dbInstance = null;
        }
    }
};
