// lib/emailClientInit.js
const EmailClient = require('notification-client');

let client = null;

/**
 * Initialize the EmailClient singleton.
 * Call once at app startup before any email operations.
 * @param {object} options - EmailClient constructor options
 * @returns {EmailClient} Initialized client
 */
async function configure(options) {
    if (client) {
        return client;
    }
    client = new EmailClient(options);
    await client.initialize();
    return client;
}

/**
 * Get the initialized EmailClient instance.
 * Throws if configure() has not been called.
 * @returns {EmailClient}
 */
function getClient() {
    if (!client) {
        throw new Error('EmailClient not initialized. Call configure() at startup.');
    }
    return client;
}

module.exports = { configure, getClient };