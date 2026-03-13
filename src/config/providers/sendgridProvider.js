// src/config/providers/sendgridProvider.js
const axios = require('axios');
const BaseEmailProvider = require('./baseProvider');

/**
 * SendGrid Email Provider
 */
class SendGridProvider extends BaseEmailProvider {
  constructor(config, dependencies) {
    super(config, dependencies);
    this.apiKey = null;
  }

  async connect() {
    this.apiKey = this.credentials.apiKey;

    try {
      await axios.get('https://api.sendgrid.com/v3/scopes', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: this.timeout
      });

      this.logger.info('SendGrid provider connected');
    } catch (error) {
      this.logger.error(`SendGrid connection failed: ${error.message}`);
      const err = new Error(`SendGrid authentication failed: ${error.message}`);
      err.code = 'AUTH_FAILED';
      throw err;
    }
  }

  async send(emailData) {
    this.validateEmailData(emailData);
    const normalized = this.normalizeEmailData(emailData);

    const payload = {
      personalizations: [
        {
          to: normalized.to.map(email => ({ email }))
        }
      ],
      from: {
        email: this.config.fromAddress,
        name: this.config.fromName
      },
      subject: emailData.subject,
      content: [
        {
          type: emailData.isHtml ? 'text/html' : 'text/plain',
          value: emailData.body
        }
      ]
    };

    if (normalized.cc && normalized.cc.length > 0) {
      payload.personalizations[0].cc = normalized.cc.map(email => ({ email }));
    }
    if (normalized.bcc && normalized.bcc.length > 0) {
      payload.personalizations[0].bcc = normalized.bcc.map(email => ({ email }));
    }

    if (emailData.replyTo) {
      payload.reply_to = { email: emailData.replyTo };
    }

    if (emailData.attachments && emailData.attachments.length > 0) {
      payload.attachments = emailData.attachments.map(att => ({
        content: att.content,
        filename: att.filename,
        type: att.contentType,
        disposition: 'attachment'
      }));
    }

    try {
      const response = await this.withRetry(() => axios.post(
          'https://api.sendgrid.com/v3/mail/send',
          payload,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: this.timeout
          }
      ));

      const messageId = response.headers['x-message-id'] || 'sendgrid-' + Date.now();
      this.logger.info(`Email sent via SendGrid: ${messageId}`);

      return {
        messageId: messageId,
        statusCode: response.status
      };
    } catch (error) {
      this.logger.error(`SendGrid send failed: ${error.message}`);
      if (error.code === 'RATE_LIMITED') {
        throw error;
      }
      const err = new Error(`Failed to send email: ${error.response?.data?.errors?.[0]?.message || error.message}`);
      err.code = 'SEND_FAILED';
      throw err;
    }
  }
}

module.exports = SendGridProvider;