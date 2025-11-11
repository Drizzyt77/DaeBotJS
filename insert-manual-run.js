/**
 * Manual Run Insertion Script
 *
 * This script allows manual insertion of Mythic+ runs into the database for testing.
 * Called by the Tauri backend when the developer menu is used.
 *
 * Usage: node insert-manual-run.js <json-data>
 * Where json-data is a JSON string containing the run information
 */

const { MythicRunsDatabase } = require('./database/mythic-runs-db');

// Parse command line arguments
if (process.argv.length < 3) {
    console.error('❌ Error: Missing run data argument');
    console.error('Usage: node insert-manual-run.js <json-data>');
    process.exit(1);
}

let runData;
try {
    runData = JSON.parse(process.argv[2]);
    console.log('✓ Parsed run data:', runData);
} catch (error) {
    console.error('❌ Failed to parse run data:', error.message);
    process.exit(1);
}

// Validate required fields
const requiredFields = ['characterName', 'realm', 'region', 'dungeon', 'keystoneLevel'];
const missingFields = requiredFields.filter(field => !runData[field]);

if (missingFields.length > 0) {
    console.error('❌ Missing required fields:', missingFields.join(', '));
    process.exit(1);
}

async function insertManualRun() {
    try {
        console.log('📂 Initializing database...');
        const db = new MythicRunsDatabase();

        console.log('👤 Upserting character...');
        // Upsert character (create if doesn't exist, update if exists)
        const characterId = db.upsertCharacter(
            runData.characterName,
            runData.realm,
            runData.region,
            'Unknown', // class - unknown for manual runs
            runData.spec || 'Unknown',
            runData.role || 'DPS'
        );
        console.log(`✓ Character ID: ${characterId}`);

        console.log('📝 Inserting run...');
        // Insert the run
        const completedTimestamp = runData.completedTimestamp || Date.now();
        const result = db.insertRun(characterId, {
            dungeon: runData.dungeon,
            mythic_level: parseInt(runData.keystoneLevel),
            completed_timestamp: completedTimestamp,
            duration: parseInt(runData.completionTime) || 0,
            keystone_run_id: Date.now(), // Use timestamp as unique ID for manual runs
            is_completed_within_time: runData.upgradedLevel > 0,
            score: 0, // Manual runs don't have scores
            num_keystone_upgrades: parseInt(runData.upgradedLevel) || 0,
            spec_name: runData.spec || 'Unknown',
            spec_role: runData.role || 'DPS',
            affixes: null, // Manual runs don't track affixes
            season: runData.season || 'manual-insert' // Use provided season or mark as manually inserted
        });

        if (result.inserted) {
            console.log('✅ Successfully inserted manual run!');
            console.log(`   Run ID: ${result.id}`);
            console.log(`   Character: ${runData.characterName}-${runData.realm}`);
            console.log(`   Dungeon: ${runData.dungeon} +${runData.keystoneLevel}`);
            console.log(`   Spec: ${runData.spec} (${runData.role})`);
        } else {
            console.log('⚠️  Run already exists (duplicate detected)');
        }

        // Close database connection
        db.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ Failed to insert manual run:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run the insertion
insertManualRun();
