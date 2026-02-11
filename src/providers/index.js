/**
 * Email Providers Export
 */

const BaseEmailProvider = require('./baseProvider');
const GmailProvider = require('./gmailProvider');
const SendGridProvider = require('./sendgridProvider');
const MSGraphProvider = require('./msgraphProvider');
const OutlookProvider = require('./outlookProvider');

module.exports = {
  BaseEmailProvider,
  GmailProvider,
  SendGridProvider,
  MSGraphProvider,
  OutlookProvider
};
