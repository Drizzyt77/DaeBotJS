/**
 * Discord Slash Command Registration Script
 *
 * This script automatically discovers and registers all slash commands with Discord.
 * It reads command definitions from the commands directory and uploads them to Discord
 * using the Discord REST API.
 *
 * Usage: node commands.js
 *
 * Requirements:
 * - config.json must contain clientId, guildId, and bot token
 * - All command files in ./commands/ must export a valid SlashCommandBuilder
 *
 * This script should be run:
 * - When adding new commands
 * - When modifying existing command definitions
 * - When setting up the bot for the first time
 */

const fs = require("fs");
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { getConfigPath } = require('./utils/app-paths');

/**
 * Load and validate configuration required for command registration
 * First checks environment variables (set by Tauri), then falls back to config.json
 */
let clientId, guildId, token;

// Check if running from Tauri (environment variables set)
if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_GUILD_ID && process.env.DISCORD_TOKEN) {
    clientId = process.env.DISCORD_CLIENT_ID;
    guildId = process.env.DISCORD_GUILD_ID;
    token = process.env.DISCORD_TOKEN;

    console.log('✓ Configuration loaded from environment variables');
    console.log(`Client ID: ${clientId}`);
    console.log(`Guild ID: ${guildId}`);
} else {
    // Fall back to config.json (for standalone/dev usage)
    try {
        const configPath = getConfigPath();
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        ({ clientId, guildId, token } = config);

        // Validate required configuration values
        if (!clientId || !guildId || !token) {
            throw new Error('Missing required configuration: clientId, guildId, or token');
        }

        console.log('✓ Configuration loaded from config.json');
        console.log(`Client ID: ${clientId}`);
        console.log(`Guild ID: ${guildId}`);

    } catch (error) {
        console.error('❌ Failed to load configuration:', error.message);
        console.error('Please ensure config.json exists and contains clientId, guildId, and token');
        process.exit(1);
    }
}

/**
 * Discover and load all command definitions from the commands directory
 */
console.log('\n📂 Discovering slash commands...');

const commands = [];
let commandFiles;

try {
    commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
    console.log(`Found ${commandFiles.length} command files`);

} catch (error) {
    console.error('❌ Failed to read commands directory:', error.message);
    process.exit(1);
}

/**
 * Load and validate each command file
 */
for (const file of commandFiles) {
    console.log(`\n--- Processing ${file} ---`);

    let command;
    try {
        console.log(`  [1/4] Attempting require...`);
        command = require(`./commands/${file}`);
        console.log(`  [1/4] ✓ Require successful`);
    } catch (error) {
        console.error(`  [1/4] ❌ Require failed:`, error.message);
        console.error(`         Error name:`, error.name);
        console.error(`         Stack:`, error.stack);
        continue;
    }

    // Validate command object exists
    console.log(`  [2/4] Validating command object...`);
    if (!command) {
        console.error(`  [2/4] ❌ Command is null/undefined`);
        continue;
    }
    console.log(`  [2/4] ✓ Command object exists`);
    console.log(`         Keys:`, Object.keys(command));

    // Validate data property
    console.log(`  [3/4] Validating data property...`);
    if (!command.data) {
        console.error(`  [3/4] ❌ Missing 'data' property`);
        console.error(`         Available keys:`, Object.keys(command));
        continue;
    }
    console.log(`  [3/4] ✓ Data property exists`);

    // Validate toJSON method
    console.log(`  [4/4] Validating toJSON method...`);
    if (typeof command.data.toJSON !== 'function') {
        console.error(`  [4/4] ❌ Invalid SlashCommandBuilder`);
        console.error(`         data type:`, typeof command.data);
        console.error(`         toJSON type:`, typeof command.data.toJSON);
        continue;
    }
    console.log(`  [4/4] ✓ toJSON method exists`);

    // Convert to JSON and add to registration list
    try {
        const commandJson = command.data.toJSON();
        commands.push(commandJson);
        console.log(`  ✅ SUCCESS: ${commandJson.name} - ${commandJson.description}`);
    } catch (error) {
        console.error(`  ❌ toJSON() failed:`, error.message);
        console.error(`     Stack:`, error.stack);
    }
}

console.log(`\n📋 Prepared ${commands.length} commands for registration`);

/**
 * Register commands with Discord via REST API
 */
if (commands.length === 0) {
    console.log('⚠️  No valid commands found to register');
    process.exit(0);
}

console.log('\n🚀 Registering commands with Discord...');

const rest = new REST({ version: '9' }).setToken(token);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
    .then((result) => {
        console.log('✅ Successfully registered application commands!');
        console.log(`📊 Registered ${result.length} commands in guild ${guildId}`);

        // List registered commands
        result.forEach(cmd => {
            console.log(`   - /${cmd.name}`);
        });

        console.log('\n🎉 Command registration complete!');
    })
    .catch(error => {
        console.error('❌ Failed to register commands:', error);

        // Provide helpful error messages for common issues
        if (error.code === 401) {
            console.error('   Invalid bot token. Please check your token in config.json');
        } else if (error.code === 403) {
            console.error('   Bot lacks permissions. Ensure bot has application.commands scope');
        } else if (error.code === 404) {
            console.error('   Guild not found. Please check your guildId in config.json');
        }

        process.exit(1);
    });