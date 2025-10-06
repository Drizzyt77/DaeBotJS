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

/**
 * Load and validate configuration required for command registration
 */
let clientId, guildId, token;

try {
    const config = require('./config.json');
    ({ clientId, guildId, token } = config);

    // Validate required configuration values
    if (!clientId || !guildId || !token) {
        throw new Error('Missing required configuration: clientId, guildId, or token');
    }

    console.log('✓ Configuration loaded successfully');
    console.log(`Client ID: ${clientId}`);
    console.log(`Guild ID: ${guildId}`);

} catch (error) {
    console.error('❌ Failed to load configuration:', error.message);
    console.error('Please ensure config.json exists and contains clientId, guildId, and token');
    process.exit(1);
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
    try {
        console.log(`Loading: ${file}`);
        const command = require(`./commands/${file}`);

        // Validate command structure
        if (!command.data) {
            console.warn(`⚠️  ${file} is missing 'data' property, skipping`);
            continue;
        }

        if (typeof command.data.toJSON !== 'function') {
            console.warn(`⚠️  ${file} data is not a valid SlashCommandBuilder, skipping`);
            continue;
        }

        // Convert command to JSON and add to registration list
        const commandJson = command.data.toJSON();
        commands.push(commandJson);

        console.log(`✓ ${commandJson.name}: ${commandJson.description}`);

    } catch (error) {
        console.error(`❌ Failed to load ${file}:`, error.message);
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