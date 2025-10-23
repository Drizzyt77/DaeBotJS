/**
 * Discord Interaction Create Event Handler
 *
 * Handles all types of Discord interactions including slash commands, buttons, and select menus.
 * Provides routing logic to direct different interaction types to their appropriate handlers.
 *
 * Interaction Types Handled:
 * - Slash Commands (Chat Input Commands)
 * - Button Interactions
 * - String Select Menu Interactions
 * - Other component interactions
 *
 * The handler provides centralized error handling and logging for all interaction types.
 */

const { MessageFlags } = require("discord.js");
const { client } = require("../global_vars/vars");
const logger = require("../utils/logger");

module.exports = {
    name: 'interactionCreate',
    once: false, // This event fires repeatedly for each interaction

    /**
     * Executes when any Discord interaction is created
     * @param {Interaction} interaction - The Discord interaction object
     */
    async execute(interaction) {
        try {
            // Log interaction details for debugging
            logger.debug('Interaction received', {
                type: interaction.type,
                user: interaction.user.tag,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: interaction.commandName || null
            });

            // Handle slash commands (chat input commands)
            if (interaction.isChatInputCommand()) {
                await handleSlashCommand(interaction);
                return;
            }

            // Handle component interactions (buttons, select menus, etc.)
            if (interaction.isStringSelectMenu() || interaction.isButton()) {
                await handleComponentInteraction(interaction);
                return;
            }

            // Handle autocomplete interactions
            if (interaction.isAutocomplete()) {
                await handleAutocompleteInteraction(interaction);
                return;
            }

            // Handle modal submit interactions
            if (interaction.isModalSubmit()) {
                await handleModalSubmission(interaction);
                return;
            }

            // Log unhandled interaction types for debugging
            logger.warn('Unhandled interaction type', {
                type: interaction.type,
                user: interaction.user.tag
            });

        } catch (error) {
            logger.error('Error in interaction handler', {
                error: error.message,
                stack: error.stack,
                interactionType: interaction.type,
                user: interaction.user.tag,
                commandName: interaction.commandName || null
            });
            await sendErrorResponse(interaction, 'An unexpected error occurred while processing your interaction.');
        }
    }
};

/**
 * Handles slash command interactions
 * @param {ChatInputCommandInteraction} interaction - The slash command interaction
 */
async function handleSlashCommand(interaction) {
    const startTime = Date.now();

    // Special handling for characters command (legacy support)
    if (interaction.commandName === 'characters') {
        try {
            const charactersCommand = require('../commands/characters');
            await charactersCommand.execute(interaction);

            const duration = Date.now() - startTime;
            logger.logCommand('characters', interaction.user, interaction.guildId, {}, true, duration);
            return;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.logCommand('characters', interaction.user, interaction.guildId, {}, false, duration);
            logger.error('Error executing characters command', {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag
            });
            await sendErrorResponse(interaction, 'There was an error executing the characters command!');
            return;
        }
    }

    // Generic command handler for other commands
    const command = client.commands.get(interaction.commandName);

    if (!command) {
        logger.warn('No handler found for command', {
            commandName: interaction.commandName,
            user: interaction.user.tag
        });
        await sendErrorResponse(interaction, 'This command is not recognized.');
        return;
    }

    try {
        // Collect command options for logging
        const options = {};
        if (interaction.options) {
            interaction.options.data.forEach(option => {
                options[option.name] = option.value;
            });
        }

        await command.execute(interaction);

        const duration = Date.now() - startTime;
        logger.logCommand(interaction.commandName, interaction.user, interaction.guildId, options, true, duration);
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.logCommand(interaction.commandName, interaction.user, interaction.guildId, {}, false, duration);
        logger.error('Error executing command', {
            command: interaction.commandName,
            error: error.message,
            stack: error.stack,
            user: interaction.user.tag
        });
        await sendErrorResponse(interaction, 'There was an error while executing this command!');
    }
}

/**
 * Handles component interactions (buttons, select menus)
 * @param {ComponentInteraction} interaction - The component interaction
 */
async function handleComponentInteraction(interaction) {
    logger.debug('Component interaction received', {
        customId: interaction.customId,
        user: interaction.user.tag
    });

    // Route character-related interactions to the characters command handler
    if (interaction.customId.startsWith('char_') || interaction.customId.startsWith('notes_')) {
        try {
            const { handleCharacterInteraction } = require('../commands/characters');
            await handleCharacterInteraction(interaction);
            logger.debug('Character interaction completed', { customId: interaction.customId });
            return;
        } catch (error) {
            logger.error('Error handling character interaction', {
                customId: interaction.customId,
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag
            });
            await sendErrorResponse(interaction, 'There was an error processing your selection.');
            return;
        }
    }

    // Handle other component interactions
    // Future component handlers can be added here following the same pattern
    logger.warn('No handler found for component', {
        customId: interaction.customId,
        user: interaction.user.tag
    });
    await sendErrorResponse(interaction, 'This interaction is not recognized.');
}

/**
 * Handles modal submission interactions
 * @param {ModalSubmitInteraction} interaction - The modal submit interaction
 */
async function handleModalSubmission(interaction) {
    logger.debug('Modal submission received', {
        customId: interaction.customId,
        user: interaction.user.tag
    });

    // Route notes modal submissions to the characters command handler
    if (interaction.customId.startsWith('notes_modal_')) {
        try {
            const { handleModalSubmission } = require('../commands/characters');
            await handleModalSubmission(interaction);
            logger.debug('Notes modal submission completed', { customId: interaction.customId });
            return;
        } catch (error) {
            logger.error('Error handling notes modal submission', {
                customId: interaction.customId,
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag
            });
            await sendErrorResponse(interaction, 'There was an error processing your form submission.');
            return;
        }
    }

    // Route bot settings modal submissions to the bot-settings command handler
    if (interaction.customId === 'bot_settings_dungeons_modal') {
        try {
            const botSettingsCommand = require('../commands/bot-settings');
            await botSettingsCommand.handleModalSubmit(interaction);
            logger.debug('Bot settings modal submission completed', { customId: interaction.customId });
            return;
        } catch (error) {
            logger.error('Error handling bot settings modal submission', {
                customId: interaction.customId,
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag
            });
            await sendErrorResponse(interaction, 'There was an error processing your settings update.');
            return;
        }
    }

    // Handle other modal submissions
    // Future modal handlers can be added here following the same pattern
    logger.warn('No handler found for modal submission', {
        customId: interaction.customId,
        user: interaction.user.tag
    });
    await sendErrorResponse(interaction, 'This form submission is not recognized.');
}

/**
 * Handles autocomplete interactions
 * @param {AutocompleteInteraction} interaction - The autocomplete interaction
 */
async function handleAutocompleteInteraction(interaction) {
    const command = client.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
        logger.warn('No autocomplete handler found for command', {
            commandName: interaction.commandName,
            user: interaction.user.tag
        });
        return;
    }

    try {
        await command.autocomplete(interaction);
    } catch (error) {
        logger.error('Error in autocomplete handler', {
            command: interaction.commandName,
            error: error.message,
            user: interaction.user.tag
        });
    }
}

/**
 * Sends an error response to the user
 * @param {Interaction} interaction - The interaction to respond to
 * @param {string} message - Error message to display
 */
async function sendErrorResponse(interaction, message) {
    try {
        const errorResponse = {
            content: message,
            flags: MessageFlags.Ephemeral // Only visible to the user who triggered the interaction
        };

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(errorResponse);
        } else if (interaction.deferred) {
            await interaction.editReply({ content: message });
        } else {
            // If already replied, try to follow up
            await interaction.followUp(errorResponse);
        }
    } catch (error) {
        console.error('❌ Failed to send error response:', error);
        // If we can't send an error response, there's not much more we can do
        // The original error should already be logged
    }
}