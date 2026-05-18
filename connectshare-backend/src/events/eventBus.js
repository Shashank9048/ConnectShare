// ============================================================
// eventBus.js — Central EventEmitter for Activity Logging
// ============================================================
const EventEmitter = require('events');

const eventBus = new EventEmitter();

// Increase max listeners to avoid memory leak warnings
eventBus.setMaxListeners(20);

module.exports = eventBus;
