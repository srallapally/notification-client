/**
 * Email Client Library
 * Multi-provider email client for Node.js applications
 */

const EmailClient = require('./client');
const createEmailRouter = require('./middleware/emailRouter');
const providers = require('./providers');

// Main export
module.exports = EmailClient;

// Named exports
module.exports.EmailClient = EmailClient;
module.exports.createEmailRouter = createEmailRouter;
module.exports.providers = providers;

// Provider classes for custom implementations
module.exports.BaseEmailProvider = providers.BaseEmailProvider;
module.exports.GmailProvider = providers.GmailProvider;
module.exports.SendGridProvider = providers.SendGridProvider;
module.exports.MSGraphProvider = providers.MSGraphProvider;
module.exports.OutlookProvider = providers.OutlookProvider;
