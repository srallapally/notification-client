// src/config/providers/baseProvider.js
/**
 * Base Email Provider
 * Abstract class that all email providers must extend
 */

const validator = require('validator');
const { inspect } = require('util');
const DEFAULT_TIMEOUT_MS = 30000;
const CREDENTIAL_METADATA_KEYS = ['secretName', 'encrypted'];

class BaseEmailProvider {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.logger = dependencies.logger || this.createDefaultLogger();
    this.secretStore = dependencies.secretStore;
    this.encryption = dependencies.encryption;
    this.credentials = null;
    this.timeout = config.timeout || DEFAULT_TIMEOUT_MS;

    const retry = config.retry || {};
    this.retryConfig = {
      maxAttempts: retry.maxAttempts || 3,
      baseDelay: retry.baseDelay || 1000,
      maxDelay: retry.maxDelay || 10000
    };
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
      let raw;

      // If secretStore provided and secretName specified
      if (this.secretStore && credConfig.secretName) {
        raw = await this.secretStore.getSecret(credConfig.secretName);
        this.logger.debug('Loaded credentials from secret store');
      }
      // If encryption service provided
      else if (this.encryption && credConfig.encrypted) {
        raw = {};
        for (const [key, value] of Object.entries(credConfig)) {
          if (!CREDENTIAL_METADATA_KEYS.includes(key)) {
            raw[key] = this.encryption.decrypt(value);
          }
        }
        this.logger.debug('Loaded encrypted credentials');
      }
      // Use inline credentials (already decrypted or plain)
      else {
        raw = {};
        for (const [key, value] of Object.entries(credConfig)) {
          if (!CREDENTIAL_METADATA_KEYS.includes(key)) {
            raw[key] = value;
          }
        }
        this.logger.debug('Loaded inline credentials');
      }

      this.credentials = this._wrapCredentials(raw);
    } catch (error) {
      throw new Error(`Failed to load credentials: ${error.message}`);
    }
  }

  /**
   * Wrap credentials so they cannot be accidentally serialized
   * Property access works normally; JSON.stringify and console.log show [REDACTED]
   * @param {object} raw - Plain credentials object
   * @returns {object} Protected credentials
   */
  _wrapCredentials(raw) {
    const redacted = {};
    for (const key of Object.keys(raw)) {
      redacted[key] = '[REDACTED]';
    }

    const wrapped = Object.create({
      toJSON() { return redacted; },
      [inspect.custom]() { return redacted; }
    });

    for (const [key, value] of Object.entries(raw)) {
      Object.defineProperty(wrapped, key, {
        value: value,
        enumerable: false,
        configurable: false,
        writable: false
      });
    }

    return Object.freeze(wrapped);
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
    return typeof email === 'string' && validator.isEmail(email);
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

  /**
   * Execute a function with retry and exponential backoff
   * @param {function} fn - Async function to execute
   * @returns {*} Result of fn
   */
  async withRetry(fn) {
    let lastError;

    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error)) {
          throw error;
        }

        if (attempt < this.retryConfig.maxAttempts - 1) {
          const delay = this.getRetryDelay(error, attempt);
          this.logger.warn(`Retryable error (attempt ${attempt + 1}/${this.retryConfig.maxAttempts}), retrying in ${delay}ms: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Retries exhausted
    if (this.isRateLimited(lastError)) {
      const err = new Error(`Rate limited after ${this.retryConfig.maxAttempts} attempts: ${lastError.message}`);
      err.code = 'RATE_LIMITED';
      throw err;
    }

    throw lastError;
  }

  /**
   * Determine if an error is retryable
   * @param {Error} error - The error to check
   * @returns {boolean}
   */
  isRetryable(error) {
    // Network timeouts
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      return true;
    }

    // SMTP transient errors (4xx class)
    if (error.responseCode && error.responseCode >= 400 && error.responseCode < 500) {
      return true;
    }

    // HTTP status-based (axios errors)
    const status = error.response?.status;
    if (status === 429 || status === 502 || status === 503 || status === 504) {
      return true;
    }

    return false;
  }

  /**
   * Check if error is specifically a rate limit
   * @param {Error} error
   * @returns {boolean}
   */
  isRateLimited(error) {
    return error.response?.status === 429;
  }

  /**
   * Calculate retry delay, honoring Retry-After header for 429s
   * @param {Error} error
   * @param {number} attempt - Zero-based attempt number
   * @returns {number} Delay in milliseconds
   */
  getRetryDelay(error, attempt) {
    // Honor Retry-After header if present
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      const parsed = Number(retryAfter);
      if (!isNaN(parsed)) {
        return parsed * 1000;
      }
      // Retry-After can also be an HTTP date
      const date = Date.parse(retryAfter);
      if (!isNaN(date)) {
        return Math.max(0, date - Date.now());
      }
    }

    // Exponential backoff with jitter
    const exponential = this.retryConfig.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * this.retryConfig.baseDelay;
    return Math.min(exponential + jitter, this.retryConfig.maxDelay);
  }
}

module.exports = BaseEmailProvider;