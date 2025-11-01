import { useState, useEffect } from 'react';
import { getBotStatus, startBot as apiStartBot, stopBot as apiStopBot, restartBot as apiRestartBot, getStartupError } from '../tauriApi';

/**
 * Custom hook for managing bot status and controls
 */
function useBot() {
    const [botStatus, setBotStatus] = useState({
        online: false,
        isRunning: false,
        status: 'stopped'
    });

    useEffect(() => {
        loadBotStatus();

        // Poll for status updates every 2 seconds
        const interval = setInterval(loadBotStatus, 2000);

        return () => clearInterval(interval);
    }, []);

    const loadBotStatus = async () => {
        try {
            const status = await getBotStatus();
            setBotStatus({
                online: status === 'running',
                isRunning: status === 'running',
                status: status // Include the full status: 'running', 'stopping', 'stopped'
            });
        } catch (error) {
            console.error('Failed to load bot status:', error);
            setBotStatus({
                online: false,
                isRunning: false,
                status: 'stopped'
            });
        }
    };

    const startBot = async () => {
        try {
            const message = await apiStartBot();

            // Wait a moment for the bot to start and potentially write error file
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Check for startup errors
            const startupError = await getStartupError();
            if (startupError) {
                // Bot failed to start, show detailed error
                throw new Error(startupError);
            }

            await loadBotStatus(); // Refresh status
            return { success: true, message };
        } catch (error) {
            console.error('Failed to start bot:', error);
            throw error;
        }
    };

    const stopBot = async () => {
        try {
            const message = await apiStopBot();
            await loadBotStatus(); // Refresh status
            return { success: true, message };
        } catch (error) {
            console.error('Failed to stop bot:', error);
            throw error;
        }
    };

    const restartBot = async () => {
        try {
            const message = await apiRestartBot();
            await loadBotStatus(); // Refresh status
            return { success: true, message };
        } catch (error) {
            console.error('Failed to restart bot:', error);
            throw error;
        }
    };

    return {
        botStatus,
        startBot,
        stopBot,
        restartBot
    };
}

export default useBot;
