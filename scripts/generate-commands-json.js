#!/usr/bin/env node

/**
 * Command JSON Generator
 *
 * Generates a commands.json file from Discord command definitions.
 * This allows the Rust backend to deploy commands without requiring Node.js at runtime.
 *
 * Usage: node scripts/generate-commands-json.js
 */

const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

async function main() {
    try {
        log('\n' + '='.repeat(60), colors.bright);
        log('   Discord Commands JSON Generator', colors.bright);
        log('='.repeat(60) + '\n', colors.bright);

        const commandsDir = path.join(__dirname, '..', 'commands');
        const outputPath = path.join(__dirname, '..', 'dist-backend', 'commands.json');

        log('📂 Reading commands directory...', colors.yellow);
        log(`   Location: ${commandsDir}`, colors.reset);

        // Ensure dist-backend directory exists
        const distBackendDir = path.dirname(outputPath);
        if (!fs.existsSync(distBackendDir)) {
            fs.mkdirSync(distBackendDir, { recursive: true });
            log('✓ Created dist-backend directory', colors.green);
        }

        // Read all command files
        const commandFiles = fs.readdirSync(commandsDir)
            .filter(file => file.endsWith('.js') && file !== 'index.js');

        log(`\n✓ Found ${commandFiles.length} command files`, colors.green);

        const commands = [];
        let successCount = 0;
        let failCount = 0;

        // Process each command file
        for (const file of commandFiles) {
            const filePath = path.join(commandsDir, file);

            try {
                log(`\nProcessing: ${file}`, colors.blue);

                // Clear the require cache to ensure fresh load
                delete require.cache[require.resolve(filePath)];

                const command = require(filePath);

                // Validate command structure
                if (!command || !command.data) {
                    log(`  ❌ Invalid: Missing 'data' property`, colors.red);
                    failCount++;
                    continue;
                }

                if (typeof command.data.toJSON !== 'function') {
                    log(`  ❌ Invalid: Missing 'toJSON' method`, colors.red);
                    failCount++;
                    continue;
                }

                // Convert to JSON
                const commandJson = command.data.toJSON();
                commands.push(commandJson);

                log(`  ✓ /${commandJson.name} - ${commandJson.description}`, colors.green);
                successCount++;

            } catch (error) {
                log(`  ❌ Error: ${error.message}`, colors.red);
                failCount++;
            }
        }

        // Write commands.json
        log(`\n💾 Writing commands.json...`, colors.yellow);
        fs.writeFileSync(outputPath, JSON.stringify(commands, null, 2));
        log(`✓ Saved to: ${outputPath}`, colors.green);

        // Summary
        log('\n' + '='.repeat(60), colors.bright);
        log('   Generation Complete!', colors.green);
        log('='.repeat(60), colors.bright);
        log(`\n✓ Successfully processed: ${successCount} commands`, colors.green);
        if (failCount > 0) {
            log(`⚠ Failed to process: ${failCount} commands`, colors.yellow);
        }
        log(`📄 Output: dist-backend/commands.json\n`, colors.blue);

    } catch (error) {
        log(`\n❌ Error: ${error.message}\n`, colors.red);
        process.exit(1);
    }
}

// Run the script
main();
