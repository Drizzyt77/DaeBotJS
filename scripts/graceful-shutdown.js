/**
 * Graceful Bot Shutdown Script
 *
 * Finds and gracefully stops the running DaeBotJS process.
 * Sends SIGINT signal to allow proper cleanup (database, connections, etc.)
 */

const { exec } = require('child_process');
const path = require('path');

const MAIN_FILE = 'main.js';
const SHUTDOWN_TIMEOUT = 10000; // 10 seconds max wait

/**
 * Find Node.js process running main.js
 * @returns {Promise<string|null>} Process ID or null if not found
 */
function findBotProcess() {
    return new Promise((resolve) => {
        // Windows command to find Node.js process running main.js
        const command = 'wmic process where "name=\'node.exe\'" get processid,commandline /format:csv';

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error finding process:', error.message);
                resolve(null);
                return;
            }

            const lines = stdout.split('\n');
            for (const line of lines) {
                if (line.includes(MAIN_FILE)) {
                    // Extract PID from CSV format: Node,CommandLine,ProcessId
                    const parts = line.split(',');
                    const pid = parts[parts.length - 1].trim();
                    if (pid && !isNaN(pid)) {
                        resolve(pid);
                        return;
                    }
                }
            }
            resolve(null);
        });
    });
}

/**
 * Send graceful shutdown signal to process
 * @param {string} pid - Process ID
 * @returns {Promise<boolean>} True if successful
 */
function shutdownProcess(pid) {
    return new Promise((resolve) => {
        console.log(`Sending graceful shutdown signal to process ${pid}...`);

        // First try graceful shutdown without /F
        exec(`taskkill /PID ${pid}`, (error) => {
            if (error) {
                // If graceful fails, use force terminate
                console.log('Graceful shutdown failed, using force terminate...');
                exec(`taskkill /F /PID ${pid}`, (error2) => {
                    if (error2) {
                        console.error('Error force terminating process:', error2.message);
                        resolve(false);
                        return;
                    }
                    resolve(true);
                });
                return;
            }
            resolve(true);
        });
    });
}

/**
 * Wait for process to exit
 * @param {string} pid - Process ID
 * @returns {Promise<boolean>} True if process exited
 */
function waitForExit(pid) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const checkInterval = 500; // Check every 500ms

        const checkProcess = () => {
            exec(`tasklist /FI "PID eq ${pid}" /NH`, (error, stdout) => {
                if (error || !stdout.includes(pid)) {
                    // Process no longer exists
                    console.log('Bot has stopped successfully.');
                    resolve(true);
                    return;
                }

                // Check timeout
                if (Date.now() - startTime > SHUTDOWN_TIMEOUT) {
                    console.error(`Process did not exit within ${SHUTDOWN_TIMEOUT}ms. Force killing...`);
                    exec(`taskkill /F /PID ${pid}`, () => {
                        resolve(false);
                    });
                    return;
                }

                // Continue checking
                setTimeout(checkProcess, checkInterval);
            });
        };

        checkProcess();
    });
}

/**
 * Main execution
 */
async function main() {
    console.log('=================================');
    console.log('   DaeBotJS Graceful Shutdown');
    console.log('=================================\n');

    // Find the bot process
    console.log('Searching for running bot process...');
    const pid = await findBotProcess();

    if (!pid) {
        console.log('No running bot process found.');
        process.exit(1); // Exit with code 1 (warning, not error)
        return;
    }

    console.log(`Found bot process with PID: ${pid}`);

    // Send shutdown signal
    const shutdownSent = await shutdownProcess(pid);
    if (!shutdownSent) {
        console.error('Failed to send shutdown signal.');
        process.exit(2);
        return;
    }

    // Wait for graceful exit
    const exited = await waitForExit(pid);

    if (exited) {
        console.log('Bot shutdown completed successfully.\n');
        process.exit(0);
    } else {
        console.log('Bot was force-killed after timeout.\n');
        process.exit(3);
    }
}

// Run the script
main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(4);
});
