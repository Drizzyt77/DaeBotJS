/**
 * DaeBotJS - World of Warcraft Guild Management Discord Bot
 *
 * Main application entry point that initializes the Discord bot client,
 * loads commands and event handlers, sets up error handling, and manages
 * the bot lifecycle including graceful shutdown procedures.
 *
 * Features:
 * - Automatic command loading from commands directory
 * - Event handler registration from events directory
 * - Graceful shutdown handling with resource cleanup
 * - Global error handling for uncaught exceptions
 * - Character command auto-refresh initialization
 */

const fs = require('fs');
const { Collection } = require('discord.js');
const path = require('node:path');
const { client } = require('./global_vars/vars');
const logger = require('./utils/logger');
const { getConfigPath, getEnvPath } = require('./utils/app-paths');

// Load environment variables from .env file in AppData
const envPath = getEnvPath();
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    logger.info('.env loaded from AppData', { path: envPath });
} else {
    logger.warn('.env not found in AppData', { path: envPath });
}

/**
 * Load configuration and validate required settings
 * Ensures bot token is available before proceeding with initialization
 */
let token;
try {
    const configPath = getConfigPath();

    if (!fs.existsSync(configPath)) {
        throw new Error(`config.json not found at ${configPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    token = config.token;

    if (!token) {
        throw new Error('Bot token is missing from config.json');
    }

    logger.info('Configuration loaded successfully from AppData', {
        path: configPath,
        charactersCount: config.characters?.length || 0
    });
} catch (error) {
    const errorMessage = `CONFIGURATION ERROR: ${error.message}\n\n` +
        `Please ensure:\n` +
        `1. config.json exists in: ${getConfigPath()}\n` +
        `2. config.json contains a valid Discord bot token\n` +
        `3. config.json has proper JSON formatting\n\n` +
        `Use the Settings page in the app to configure your bot.`;

    logger.error('Failed to load configuration', { error: error.message });
    console.error('\n' + '='.repeat(70));
    console.error(errorMessage);
    console.error('='.repeat(70) + '\n');

    // Write error to a file that the GUI can check
    try {
        const { getAppDataDir } = require('./utils/app-paths');
        const errorPath = path.join(getAppDataDir(), 'startup-error.txt');
        fs.writeFileSync(errorPath, errorMessage + '\n\nTimestamp: ' + new Date().toISOString());
    } catch (writeError) {
        console.error('Could not write error file:', writeError.message);
    }

    process.exit(1);
}

/**
 * Initialize commands collection on the Discord client
 * This collection stores all loaded slash commands for later execution
 */
client.commands = new Collection();

/**
 * Load and register all slash commands from the commands directory
 * Automatically discovers and loads any .js files in the commands folder
 * Works both in normal mode and when bundled with pkg
 */
logger.info('Loading slash commands...');
try {
    if (process.pkg) {
        // Running in pkg - use the index file that explicitly requires all commands
        const commands = require('./commands/index.js');
        for (const [fileName, command] of Object.entries(commands)) {
            if (!command.data || !command.execute) {
                logger.warn(`Command ${fileName} is missing required 'data' or 'execute' properties`);
                continue;
            }
            client.commands.set(command.data.name, command);
            logger.debug(`✓ Loaded command: ${command.data.name}`);
        }
    } else {
        // Running normally - use fs to discover commands
        const commandsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'index.js');

        for (const file of commandFiles) {
            logger.debug(`Loading command: ${file}`);
            const commandPath = path.join(commandsPath, file);
            const command = require(commandPath);

            // Validate command structure
            if (!command.data || !command.execute) {
                logger.warn(`Command ${file} is missing required 'data' or 'execute' properties`);
                continue;
            }

            client.commands.set(command.data.name, command);
            logger.debug(`✓ Loaded command: ${command.data.name}`);
        }
    }

    logger.info(`Successfully loaded ${client.commands.size} commands`, { commandCount: client.commands.size });
} catch (error) {
    logger.error('Error loading commands', { error: error.message });
    process.exit(1);
}

/**
 * Load and register all event handlers from the events directory
 * Supports both one-time (once) and recurring (on) event listeners
 * Works both in normal mode and when bundled with pkg
 */
logger.info('Loading event handlers...');
try {
    if (process.pkg) {
        // Running in pkg - use the index file that explicitly requires all events
        const events = require('./events/index.js');
        let eventCount = 0;
        for (const [fileName, event] of Object.entries(events)) {
            if (!event.name || !event.execute) {
                logger.warn(`Event ${fileName} is missing required 'name' or 'execute' properties`);
                continue;
            }

            // Register event listener based on type
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
                logger.debug(`✓ Registered one-time event: ${event.name}`);
            } else {
                client.on(event.name, (...args) => event.execute(...args));
                logger.debug(`✓ Registered recurring event: ${event.name}`);
            }
            eventCount++;
        }
        logger.info('Event handlers loaded successfully', { eventCount });
    } else {
        // Running normally - use fs to discover events
        const eventsPath = path.join(__dirname, 'events');
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js') && file !== 'index.js');

        for (const file of eventFiles) {
            logger.debug(`Loading event handler: ${file}`);
            const filePath = path.join(eventsPath, file);
            const event = require(filePath);

            // Validate event structure
            if (!event.name || !event.execute) {
                logger.warn(`Event ${file} is missing required 'name' or 'execute' properties`);
                continue;
            }

            // Register event listener based on type
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
                logger.debug(`✓ Registered one-time event: ${event.name}`);
            } else {
                client.on(event.name, (...args) => event.execute(...args));
                logger.debug(`✓ Registered recurring event: ${event.name}`);
            }
        }

        logger.info('Event handlers loaded successfully', { eventCount: eventFiles.length });
    }
} catch (error) {
    logger.error('Error loading event handlers', { error: error.message });
    process.exit(1);
}

/**
 * Global error handling for uncaught exceptions
 * Prevents the bot from crashing on unexpected errors while logging them
 */
process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception detected", {
        error: err.message,
        stack: err.stack,
        name: err.name
    });

    // In production, you might want to implement additional error reporting here
    // such as sending alerts to administrators or logging to external services
});

/**
 * Graceful shutdown handler for SIGINT (Ctrl+C)
 * Ensures proper cleanup of resources before the bot terminates
 */
process.on('SIGINT', () => {
    logger.info('Bot shutdown signal received');
    logger.info('Performing cleanup operations');

    try {
        // Cleanup character command resources (auto-refresh intervals, caches, etc.)
        const charactersCommand = require('./commands/characters');
        charactersCommand.cleanup();

        logger.info('Character command cleanup completed');

        // Cleanup token tracker service
        if (client.tokenTracker) {
            client.tokenTracker.stop();
            logger.info('Token tracker cleanup completed');
        }

        // Stop periodic sync service
        const { stopPeriodicSync } = require('./services/periodic-sync');
        stopPeriodicSync();
        logger.info('Periodic sync service stopped');

        // Close token database connection
        const { closeTokenDatabase } = require('./database/token-db');
        closeTokenDatabase();
        logger.info('Token database connection closed');

        // Close mythic runs database connection
        const { closeDatabase } = require('./database/mythic-runs-db');
        closeDatabase();
        logger.info('Mythic runs database connection closed');

        // Destroy the Discord client connection
        client.destroy();
        logger.info('Discord client connection terminated');

        logger.info('Bot shutdown completed successfully');

        // Close logger stream
        logger.close();

        process.exit(0);

    } catch (error) {
        logger.error('Error during shutdown cleanup', { error: error.message });
        process.exit(1);
    }
});

/**
 * Handle other termination signals for comprehensive shutdown coverage
 */
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, initiating graceful shutdown');
    process.emit('SIGINT'); // Reuse SIGINT handler
});

/**
 * Initialize image cache for faster character image generation
 */
const { initializeImageCache } = require('./utils/character-image-generator');
initializeImageCache();

/**
 * Start the Discord bot by logging in with the configured token
 * This initiates the connection to Discord and triggers the 'ready' event
 */
logger.info('Starting Discord bot');
logger.info('Bot initialization complete, logging in to Discord...');
client.login(token)
    .then(() => {
        logger.info('Bot login initiated successfully');
    })
    .catch(error => {
        logger.error('Failed to login to Discord', {
            error: error.message,
            code: error.code
        });

        if (error.code === 'TOKEN_INVALID') {
            logger.error('The bot token in config.json is invalid');
        } else if (error.code === 'DISALLOWED_INTENTS') {
            logger.error('The bot is missing required intents');
        }

        process.exit(1);
    });