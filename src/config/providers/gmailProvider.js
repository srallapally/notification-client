const nodemailer = require('nodemailer');
const BaseEmailProvider = require('./baseProvider');

/**
 * Gmail Email Provider (SMTP)
 */
class GmailProvider extends BaseEmailProvider {
  constructor(config, dependencies) {
    super(config, dependencies);
    this.transporter = null;
  }

  async connect() {
    const smtp = this.config.smtp || {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false
    };

    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: this.credentials.username,
        pass: this.credentials.password
      }
    });

    try {
      await this.transporter.verify();
      this.logger.info('Gmail provider connected');
    } catch (error) {
      this.logger.error(`Gmail connection failed: ${error.message}`);
      const err = new Error(`Gmail authentication failed: ${error.message}`);
      err.code = 'AUTH_FAILED';
      throw err;
    }
  }

  async send(emailData) {
    this.validateEmailData(emailData);
    const normalized = this.normalizeEmailData(emailData);

    const mailOptions = {
      from: `"${this.config.fromName}" <${this.config.fromAddress}>`,
      to: normalized.to.join(', '),
      subject: emailData.subject
    };

    if (emailData.isHtml) {
      mailOptions.html = emailData.body;
    } else {
      mailOptions.text = emailData.body;
    }

    if (normalized.cc && normalized.cc.length > 0) {
      mailOptions.cc = normalized.cc.join(', ');
    }
    if (normalized.bcc && normalized.bcc.length > 0) {
      mailOptions.bcc = normalized.bcc.join(', ');
    }
    if (emailData.replyTo) {
      mailOptions.replyTo = emailData.replyTo;
    }

    if (emailData.attachments && emailData.attachments.length > 0) {
      mailOptions.attachments = emailData.attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.contentType
      }));
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.info(`Email sent via Gmail: ${info.messageId}`);

      return {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected
      };
    } catch (error) {
      this.logger.error(`Gmail send failed: ${error.message}`);
      const err = new Error(`Failed to send email: ${error.message}`);
      err.code = 'SEND_FAILED';
      throw err;
    }
  }

  async disconnect() {
    if (this.transporter) {
      this.transporter.close();
      this.logger.debug('Gmail transporter closed');
    }
  }
}

module.exports = GmailProvider;
