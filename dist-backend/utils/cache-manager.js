/**
 * Cache Manager Utility
 * Provides centralized caching functionality for character data with TTL (Time To Live) support
 * Handles different cache types with configurable durations and provides cache invalidation
 */

const logger = require('./logger');

/**
 * Default cache durations in milliseconds
 * These can be overridden when creating cache instances
 */
const DEFAULT_CACHE_DURATIONS = {
    CHARACTER_DATA: 30 * 60 * 1000,    // 30 minutes
    RAID_DATA: 30 * 60 * 1000,         // 30 minutes
    MPLUS_DATA: 30 * 60 * 1000,        // 30 minutes
    GEAR_DATA: 30 * 60 * 1000,         // 30 minutes
    LINKS_DATA: 60 * 60 * 1000         // 1 hour (static data)
};

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {*} data - The cached data
 * @property {number} timestamp - When the data was cached
 * @property {number} ttl - Time to live in milliseconds
 */

/**
 * Cache Manager class for handling data caching with TTL
 */
class CacheManager {
    constructor() {
        // Map to store cache entries by key
        this.cache = new Map();

        // Track cache statistics for debugging
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            invalidations: 0
        };
    }

    /**
     * Generates a cache key for the given type and identifier
     * @param {string} type - Type of cache (e.g., 'character', 'raid', 'gear')
     * @param {string} identifier - Additional identifier (optional)
     * @returns {string} Cache key
     */
    generateKey(type, identifier = '') {
        return identifier ? `${type}:${identifier}` : type;
    }

    /**
     * Checks if a cache entry is still valid based on its TTL
     * @param {CacheEntry} entry - Cache entry to validate
     * @returns {boolean} True if entry is still valid
     */
    isValidEntry(entry) {
        if (!entry || !entry.timestamp || !entry.ttl) {
            return false;
        }

        const now = Date.now();
        const expirationTime = entry.timestamp + entry.ttl;
        return now < expirationTime;
    }

    /**
     * Retrieves data from cache if valid, otherwise returns null
     * @param {string} key - Cache key
     * @returns {*|null} Cached data if valid, null otherwise
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            logger.logCache('MISS', key, { reason: 'not_found' });
            return null;
        }

        if (!this.isValidEntry(entry)) {
            // Remove expired entry
            this.cache.delete(key);
            this.stats.misses++;
            logger.logCache('MISS', key, { reason: 'expired' });
            return null;
        }

        this.stats.hits++;
        const ttlRemaining = Math.round((entry.timestamp + entry.ttl - Date.now()) / 1000);
        logger.logCache('HIT', key, { ttl: ttlRemaining });
        return entry.data;
    }

    /**
     * Stores data in cache with specified TTL
     * @param {string} key - Cache key
     * @param {*} data - Data to cache
     * @param {number} ttl - Time to live in milliseconds
     */
    set(key, data, ttl) {
        const entry = {
            data,
            timestamp: Date.now(),
            ttl
        };

        this.cache.set(key, entry);
        this.stats.sets++;
        logger.logCache('SET', key, { ttlSeconds: Math.round(ttl / 1000), dataSize: JSON.stringify(data).length });
    }

    /**
     * Removes a specific entry from cache
     * @param {string} key - Cache key to invalidate
     * @returns {boolean} True if entry was removed
     */
    invalidate(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.stats.invalidations++;
            logger.logCache('DELETE', key);
        }
        return deleted;
    }

    /**
     * Removes all entries matching a pattern from cache
     * @param {string} pattern - Pattern to match keys against
     * @returns {number} Number of entries removed
     */
    invalidatePattern(pattern) {
        let removed = 0;

        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                removed++;
            }
        }

        this.stats.invalidations += removed;
        return removed;
    }

    /**
     * Clears all cache entries
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.stats.invalidations += size;
    }

    /**
     * Removes all expired entries from cache
     * @returns {number} Number of expired entries removed
     */
    cleanup() {
        let removed = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (!this.isValidEntry(entry)) {
                this.cache.delete(key);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Gets cache statistics for monitoring
     * @returns {Object} Cache statistics object
     */
    getStats() {
        const totalRequests = this.stats.hits + this.stats.misses;
        const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests * 100).toFixed(2) : 0;

        return {
            ...this.stats,
            totalRequests,
            hitRate: `${hitRate}%`,
            currentSize: this.cache.size
        };
    }

    /**
     * Gets information about cache contents
     * @returns {Array} Array of cache entry information
     */
    getCacheInfo() {
        const info = [];
        const now = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            const expiresAt = entry.timestamp + entry.ttl;
            const timeLeft = expiresAt - now;
            const isExpired = timeLeft <= 0;

            info.push({
                key,
                cached: new Date(entry.timestamp).toISOString(),
                expiresAt: new Date(expiresAt).toISOString(),
                timeLeftMs: isExpired ? 0 : timeLeft,
                isExpired,
                dataSize: JSON.stringify(entry.data).length
            });
        }

        return info.sort((a, b) => b.timeLeftMs - a.timeLeftMs);
    }
}

/**
 * Specialized cache manager for character data with predefined cache types
 */
class CharacterCacheManager extends CacheManager {
    constructor(customDurations = {}) {
        super();
        this.durations = { ...DEFAULT_CACHE_DURATIONS, ...customDurations };
    }

    /**
     * Caches character mythic plus data
     * @param {Array} data - Character data array
     * @param {boolean} forceRefresh - Whether this was a forced refresh
     */
    setCharacterData(data, forceRefresh = false) {
        const key = this.generateKey('character');
        this.set(key, data, this.durations.CHARACTER_DATA);

        if (forceRefresh) {
            logger.info('Character data force refreshed and cached');
        }
    }

    /**
     * Retrieves cached character mythic plus data
     * @returns {Array|null} Cached character data or null
     */
    getCharacterData() {
        return this.get(this.generateKey('character'));
    }

    /**
     * Caches raid progression data
     * @param {Array} data - Raid data array
     */
    setRaidData(data) {
        const key = this.generateKey('raid');
        this.set(key, data, this.durations.RAID_DATA);
    }

    /**
     * Retrieves cached raid progression data
     * @returns {Array|null} Cached raid data or null
     */
    getRaidData() {
        return this.get(this.generateKey('raid'));
    }

    /**
     * Caches mythic plus recent runs data
     * @param {Array} data - M+ runs data array
     */
    setMplusData(data) {
        const key = this.generateKey('mplus');
        this.set(key, data, this.durations.MPLUS_DATA);
    }

    /**
     * Retrieves cached mythic plus recent runs data
     * @returns {Array|null} Cached M+ runs data or null
     */
    getMplusData() {
        return this.get(this.generateKey('mplus'));
    }

    /**
     * Caches gear data
     * @param {Array} data - Gear data array
     */
    setGearData(data) {
        const key = this.generateKey('gear');
        this.set(key, data, this.durations.GEAR_DATA);
    }

    /**
     * Retrieves cached gear data
     * @returns {Array|null} Cached gear data or null
     */
    getGearData() {
        return this.get(this.generateKey('gear'));
    }

    /**
     * Caches character links data
     * @param {Array} data - Links data array
     */
    setLinksData(data) {
        const key = this.generateKey('links');
        this.set(key, data, this.durations.LINKS_DATA);
    }

    /**
     * Retrieves cached character links data
     * @returns {Array|null} Cached links data or null
     */
    getLinksData() {
        return this.get(this.generateKey('links'));
    }

    /**
     * Invalidates character data cache (for refresh operations)
     */
    refreshCharacterData() {
        this.invalidate(this.generateKey('character'));
    }

    /**
     * Invalidates mythic plus data cache (for refresh operations)
     */
    refreshMplusData() {
        this.invalidate(this.generateKey('mplus'));
    }

    /**
     * Gets time until next auto-refresh for character data
     * @returns {number} Milliseconds until next refresh, or 0 if not cached
     */
    getTimeUntilRefresh() {
        const entry = this.cache.get(this.generateKey('character'));
        if (!entry || !this.isValidEntry(entry)) {
            return 0;
        }

        const expirationTime = entry.timestamp + entry.ttl;
        return Math.max(0, expirationTime - Date.now());
    }

    /**
     * Gets formatted timestamps for cache status display
     * @returns {Object|null} Timestamp information or null if no cache
     */
    getCacheTimestamps() {
        const entry = this.cache.get(this.generateKey('character'));
        if (!entry || !this.isValidEntry(entry)) {
            return null;
        }

        const cacheTimestamp = Math.floor(entry.timestamp / 1000);
        const nextRefreshTimestamp = Math.floor((entry.timestamp + entry.ttl) / 1000);

        return {
            cacheTimestamp,
            nextRefreshTimestamp
        };
    }
}

// Create singleton instance for character cache
// This ensures all parts of the app use the same cache
let characterCacheInstance = null;

/**
 * Gets or creates the singleton character cache manager instance
 * @param {Object} customDurations - Optional custom cache durations
 * @returns {CharacterCacheManager} Singleton cache manager instance
 */
function getCharacterCacheManager(customDurations = {}) {
    if (!characterCacheInstance) {
        characterCacheInstance = new CharacterCacheManager(customDurations);
    }
    return characterCacheInstance;
}

module.exports = {
    CacheManager,
    CharacterCacheManager,
    getCharacterCacheManager,
    DEFAULT_CACHE_DURATIONS
};