/**
 * Events Index
 * Explicitly exports all events for pkg bundling
 */

module.exports = {
    'ready': require('./ready.js'),
    'interractionCreate': require('./interractionCreate.js')
};
