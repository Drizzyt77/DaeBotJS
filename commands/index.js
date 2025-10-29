/**
 * Commands Index
 * Explicitly exports all commands for pkg bundling
 */

module.exports = {
    'add-run': require('./add-run.js'),
    'bot-settings': require('./bot-settings.js'),
    'characters': require('./characters.js'),
    'collect-runs': require('./collect-runs.js'),
    'import-runs': require('./import-runs.js'),
    'keytracker': require('./keytracker.js'),
    'load-best-runs': require('./load-best-runs.js'),
    'manage-characters': require('./manage-characters.js'),
    'ping': require('./ping.js'),
    'token-settings': require('./token-settings.js')
};
