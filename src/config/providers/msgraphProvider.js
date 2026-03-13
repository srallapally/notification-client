// src/config/providers/msgraphProvider.js
const axios = require('axios');
const BaseEmailProvider = require('./baseProvider');

/**
 * Microsoft Graph Email Provider
 */
class MSGraphProvider extends BaseEmailProvider {
  constructor(config, dependencies) {
    super(config, dependencies);
    this.accessToken = null;
  }

  async connect() {
    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append('client_id', this.config.clientId);
    params.append('client_secret', this.credentials.clientSecret);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('grant_type', 'client_credentials');

    try {
      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: this.timeout
      });

      this.accessToken = response.data.access_token;
      this.logger.info('MSGraph provider connected');
    } catch (error) {
      this.logger.error(`MSGraph connection failed: ${error.message}`);
      const err = new Error(`MSGraph authentication failed: ${error.message}`);
      err.code = 'AUTH_FAILED';
      throw err;
    }
  }

  async send(emailData) {
    this.validateEmailData(emailData);
    const normalized = this.normalizeEmailData(emailData);

    const message = {
      subject: emailData.subject,
      body: {
        contentType: emailData.isHtml ? 'HTML' : 'Text',
        content: emailData.body
      },
      toRecipients: normalized.to.map(email => ({
        emailAddress: { address: email }
      }))
    };

    if (normalized.cc && normalized.cc.length > 0) {
      message.ccRecipients = normalized.cc.map(email => ({
        emailAddress: { address: email }
      }));
    }

    if (normalized.bcc && normalized.bcc.length > 0) {
      message.bccRecipients = normalized.bcc.map(email => ({
        emailAddress: { address: email }
      }));
    }

    if (emailData.replyTo) {
      message.replyTo = [{ emailAddress: { address: emailData.replyTo } }];
    }

    if (emailData.attachments && emailData.attachments.length > 0) {
      message.attachments = emailData.attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.contentType,
        contentBytes: att.content
      }));
    }

    try {
      const response = await axios.post(
          `https://graph.microsoft.com/v1.0/users/${this.config.fromAddress}/sendMail`,
          {
            message: message,
            saveToSentItems: true
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: this.timeout
          }
      );

      const messageId = response.headers['request-id'] || 'msgraph-' + Date.now();
      this.logger.info(`Email sent via MSGraph: ${messageId}`);

      return {
        messageId: messageId,
        statusCode: response.status
      };
    } catch (error) {
      this.logger.error(`MSGraph send failed: ${error.message}`);
      const err = new Error(`Failed to send email: ${error.response?.data?.error?.message || error.message}`);
      err.code = 'SEND_FAILED';
      throw err;
    }
  }
}

module.exports = MSGraphProvider;