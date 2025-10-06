/**
 * World of Warcraft Weekly Reset Utility
 * Handles calculation of WoW weekly reset times in Pacific Time
 *
 * WoW weekly resets occur every Tuesday at 8:00 AM Pacific Time (PDT/PST).
 * This includes mythic plus vault rewards, raid lockouts, and other weekly content.
 * The reset time remains consistent year-round despite daylight saving changes.
 */

/**
 * World of Warcraft weekly reset configuration
 * Reset occurs every Tuesday at 8:00 AM Pacific Time
 */
const WOW_RESET_CONFIG = {
    RESET_DAY: 2,           // Tuesday (0 = Sunday, 1 = Monday, etc.)
    RESET_HOUR: 8,          // 8:00 AM
    RESET_MINUTE: 0,        // Exactly on the hour
    RESET_SECOND: 0,        // Exactly on the minute
    TIMEZONE: "America/Los_Angeles"  // Pacific Time Zone
};

/**
 * Calculates the number of days to go back from current day to find last Tuesday
 * @param {number} currentDay - Current day of week (0 = Sunday, 6 = Saturday)
 * @param {number} currentHour - Current hour (0-23)
 * @returns {number} Number of days to go back to find the last reset
 */
function calculateDaysBackToReset(currentDay, currentHour) {
    const resetDay = WOW_RESET_CONFIG.RESET_DAY;

    // If it's currently Tuesday
    if (currentDay === resetDay) {
        // If it's after 8 AM, use today's reset
        if (currentHour >= WOW_RESET_CONFIG.RESET_HOUR) {
            return 0;
        } else {
            // If it's before 8 AM, use last week's reset
            return 7;
        }
    }

    // If it's after Tuesday (Wednesday through Saturday)
    if (currentDay > resetDay) {
        return currentDay - resetDay;
    }

    // If it's before Tuesday (Sunday or Monday)
    // Sunday: dayOfWeek = 0, so 0 + 5 = 5 days back to Tuesday
    // Monday: dayOfWeek = 1, so 1 + 5 = 6 days back to Tuesday
    return currentDay + 5;
}

/**
 * Converts a Pacific Time date to UTC, accounting for daylight saving time
 * @param {Date} pacificDate - Date object representing Pacific Time
 * @returns {Date} UTC equivalent of the Pacific Time date
 */
function convertPacificToUTC(pacificDate) {
    // Create a new UTC date with the same values as the Pacific date
    const utcDate = new Date(Date.UTC(
        pacificDate.getFullYear(),
        pacificDate.getMonth(),
        pacificDate.getDate(),
        pacificDate.getHours(),
        pacificDate.getMinutes(),
        pacificDate.getSeconds()
    ));

    // Adjust for timezone offset
    // getTimezoneOffset() returns minutes difference from UTC
    // Positive values are west of UTC (like Pacific Time)
    const offsetHours = pacificDate.getTimezoneOffset() / 60;
    utcDate.setHours(utcDate.getHours() + offsetHours);

    return utcDate;
}

module.exports = {
    /**
     * Calculates the date and time of the most recent WoW weekly reset
     * Returns the last Tuesday at 8:00 AM Pacific Time, converted to UTC
     *
     * This function handles daylight saving time transitions automatically
     * by using the browser's timezone conversion capabilities.
     *
     * @returns {Date} UTC Date object representing the last weekly reset time
     *
     * @example
     * const lastReset = getLastTuesdayReset();
     * console.log('Last reset was:', lastReset.toISOString());
     *
     * // Check if a run was completed after the reset
     * const runDate = new Date(run.completed_at);
     * if (runDate >= lastReset) {
     *   console.log('This run counts for this week');
     * }
     */
    getLastTuesdayReset: function () {
        // Get current time
        const now = new Date();

        // Convert current time to Pacific Time for reset calculation
        // This handles daylight saving time automatically
        const pacificTime = new Date(now.toLocaleString("en-US", {
            timeZone: WOW_RESET_CONFIG.TIMEZONE
        }));

        // Determine how many days back we need to go to find last Tuesday reset
        const dayOfWeek = pacificTime.getDay();
        const currentHour = pacificTime.getHours();
        const daysBack = calculateDaysBackToReset(dayOfWeek, currentHour);

        // Calculate the reset date in Pacific Time
        const resetDatePT = new Date(pacificTime);
        resetDatePT.setDate(pacificTime.getDate() - daysBack);
        resetDatePT.setHours(
            WOW_RESET_CONFIG.RESET_HOUR,
            WOW_RESET_CONFIG.RESET_MINUTE,
            WOW_RESET_CONFIG.RESET_SECOND,
            0  // milliseconds
        );

        // Convert Pacific Time reset to UTC for consistent storage/comparison
        const utcReset = convertPacificToUTC(resetDatePT);

        return utcReset;
    },

    /**
     * Gets the next weekly reset date/time
     * @returns {Date} UTC Date object representing the next weekly reset time
     */
    getNextTuesdayReset: function () {
        const lastReset = this.getLastTuesdayReset();
        const nextReset = new Date(lastReset);
        nextReset.setDate(lastReset.getDate() + 7);
        return nextReset;
    },

    /**
     * Checks if a given date/time is after the current weekly reset
     * @param {Date|string} dateToCheck - Date to check (Date object or ISO string)
     * @returns {boolean} True if the date is after the current weekly reset
     */
    isAfterWeeklyReset: function (dateToCheck) {
        const checkDate = typeof dateToCheck === 'string' ? new Date(dateToCheck) : dateToCheck;
        const lastReset = this.getLastTuesdayReset();
        return checkDate >= lastReset;
    },

    /**
     * Gets the time remaining until the next weekly reset
     * @returns {Object} Object with days, hours, minutes remaining until next reset
     */
    getTimeUntilNextReset: function () {
        const now = new Date();
        const nextReset = this.getNextTuesdayReset();
        const timeDiff = nextReset.getTime() - now.getTime();

        if (timeDiff <= 0) {
            return { days: 0, hours: 0, minutes: 0, totalMs: 0 };
        }

        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

        return {
            days,
            hours,
            minutes,
            totalMs: timeDiff
        };
    },

    /**
     * Filters an array of runs to only include those completed after the weekly reset
     * @param {Array} runs - Array of run objects with 'completed_at' property
     * @returns {Array} Filtered array of runs completed this week
     */
    filterWeeklyRuns: function (runs) {
        if (!Array.isArray(runs)) {
            return [];
        }

        const lastReset = this.getLastTuesdayReset();
        return runs.filter(run => {
            if (!run.completed_at) {
                return false;
            }
            const runDate = new Date(run.completed_at);
            return runDate >= lastReset;
        });
    }
};