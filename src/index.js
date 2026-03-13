const EmailClient = require('./client');
const providers = require('./config/providers');

module.exports = EmailClient;

module.exports.EmailClient = EmailClient;
module.exports.providers = providers;

module.exports.BaseEmailProvider = providers.BaseEmailProvider;
module.exports.GmailProvider = providers.GmailProvider;
module.exports.SendGridProvider = providers.SendGridProvider;
module.exports.MSGraphProvider = providers.MSGraphProvider;
module.exports.OutlookProvider = providers.OutlookProvider;