// src/config/providers/baseProvider.js
/**
 * Base Email Provider
 * Abstract class that all email providers must extend
 */

const DEFAULT_TIMEOUT_MS = 30000;

class BaseEmailProvider {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.logger = dependencies.logger || this.createDefaultLogger();
    this.secretStore = dependencies.secretStore;
    this.encryption = dependencies.encryption;
    this.credentials = null;
    this.timeout = config.timeout || DEFAULT_TIMEOUT_MS;
  }

  /**
   * Create a default console logger if none provided
   */
  createDefaultLogger() {
    return {
      debug: (...args) => console.debug(...args),
      info: (...args) => console.info(...args),
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args)
    };
  }

  /**
   * Initialize the provider
   */
  async initialize() {
    await this.loadCredentials();
    await this.connect();
  }

  /**
   * Load credentials from configured source
   */
  async loadCredentials() {
    const credConfig = this.config.credentials;

    if (!credConfig) {
      throw new Error('No credentials configuration found');
    }

    try {
      // If secretStore provided and secretName specified
      if (this.secretStore && credConfig.secretName) {
        this.credentials = await this.secretStore.getSecret(credConfig.secretName);
        this.logger.debug('Loaded credentials from secret store');
        return;
      }

      // If encryption service provided
      if (this.encryption && credConfig.encrypted) {
        this.credentials = {};
        for (const [key, value] of Object.entries(credConfig)) {
          if (key !== 'encrypted') {
            this.credentials[key] = this.encryption.decrypt(value);
          }
        }
        this.logger.debug('Loaded encrypted credentials');
        return;
      }

      // Use inline credentials (already decrypted or plain)
      this.credentials = { ...credConfig };
      this.logger.debug('Loaded inline credentials');
    } catch (error) {
      throw new Error(`Failed to load credentials: ${error.message}`);
    }
  }

  /**
   * Connect to the email provider (override in subclass)
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Send an email (override in subclass)
   * @param {object} emailData - Email data
   * @returns {object} Send result
   */
  async send(emailData) {
    throw new Error('send() must be implemented by subclass');
  }

  /**
   * Disconnect from the provider (override in subclass if needed)
   */
  async disconnect() {
    // Optional - override if provider needs cleanup
  }

  /**
   * Validate email data
   * @param {object} emailData - Email data to validate
   */
  validateEmailData(emailData) {
    const { to, subject, body } = emailData;

    if (!to || (Array.isArray(to) && to.length === 0)) {
      const error = new Error('Missing required field: to');
      error.code = 'MISSING_REQUIRED_FIELD';
      throw error;
    }

    if (!subject) {
      const error = new Error('Missing required field: subject');
      error.code = 'MISSING_REQUIRED_FIELD';
      throw error;
    }

    if (body === undefined || body === null) {
      const error = new Error('Missing required field: body');
      error.code = 'MISSING_REQUIRED_FIELD';
      throw error;
    }

    // Validate email addresses
    const addresses = [].concat(
        to,
        emailData.cc || [],
        emailData.bcc || [],
        emailData.replyTo ? [emailData.replyTo] : []
    ).filter(Boolean);

    for (const addr of addresses) {
      if (!this.isValidEmail(addr)) {
        const error = new Error(`Invalid email address: ${addr}`);
        error.code = 'INVALID_EMAIL_ADDRESS';
        throw error;
      }
    }
  }

  /**
   * Validate email address format
   * @param {string} email - Email address
   * @returns {boolean} True if valid
   */
  isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  /**
   * Normalize email data (convert single recipients to arrays)
   * @param {object} emailData - Email data
   * @returns {object} Normalized email data
   */
  normalizeEmailData(emailData) {
    const normalized = { ...emailData };

    if (typeof normalized.to === 'string') {
      normalized.to = [normalized.to];
    }
    if (normalized.cc && typeof normalized.cc === 'string') {
      normalized.cc = [normalized.cc];
    }
    if (normalized.bcc && typeof normalized.bcc === 'string') {
      normalized.bcc = [normalized.bcc];
    }

    return normalized;
  }
}

module.exports = BaseEmailProvider;