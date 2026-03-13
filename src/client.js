// src/client.js
const {
  GmailProvider,
  SendGridProvider,
  MSGraphProvider,
  OutlookProvider
} = require('./config/providers');

/**
 * EmailClient
 * Main class for sending emails through multiple providers
 */
class EmailClient {
  constructor(options = {}) {
    this.validateOptions(options);

    this.providers = new Map();
    this.activeProvider = null;
    this.testMode = options.testMode || false;

    // Configuration
    this.config = {
      providers: options.providers || {},
      activeProvider: options.activeProvider,
      defaultProvider: options.defaultProvider
    };

    // Dependencies (optional injection)
    this.logger = options.logger || this.createDefaultLogger();
    this.secretStore = options.secretStore;
    this.encryption = options.encryption;

    this.initialized = false;
  }

  /**
   * Validate constructor options
   */
  validateOptions(options) {
    if (!options.providers || Object.keys(options.providers).length === 0) {
      throw new Error('At least one provider must be configured');
    }

    if (!options.activeProvider) {
      throw new Error('activeProvider must be specified');
    }

    if (!(options.activeProvider in options.providers)) {
      throw new Error(`Active provider '${options.activeProvider}' not found in providers config`);
    }
  }

  /**
   * Create default console logger
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
   * Initialize all enabled providers
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this._initializing) {
      return this._initializing;
    }

    this._initializing = this._doInitialize();
    try {
      await this._initializing;
    } finally {
      this._initializing = null;
    }
  }

  async _doInitialize() {
    this.logger.info('Initializing email client...');

    const dependencies = {
      logger: this.logger,
      secretStore: this.secretStore,
      encryption: this.encryption
    };

    for (const [name, config] of Object.entries(this.config.providers)) {
      if (config.enabled === false) {
        this.logger.debug(`Skipping disabled provider: ${name}`);
        continue;
      }

      try {
        const provider = this.createProvider(config, dependencies);
        await provider.initialize();
        this.providers.set(name, provider);
        this.logger.info(`Provider initialized: ${name}`);
      } catch (error) {
        this.logger.error(`Failed to initialize provider ${name}: ${error.message}`);
        // Continue with other providers
      }
    }

    if (this.providers.size === 0) {
      throw new Error('No providers could be initialized');
    }

    // Set active provider
    this.activeProvider = this.providers.get(this.config.activeProvider);
    if (!this.activeProvider) {
      throw new Error(`Active provider '${this.config.activeProvider}' failed to initialize`);
    }

    this.initialized = true;
    this.logger.info(`Email client initialized with active provider: ${this.config.activeProvider}`);
  }

  /**
   * Create a provider instance based on type
   */
  createProvider(config, dependencies) {
    switch (config.type) {
      case 'gmail':
        return new GmailProvider(config.config, dependencies);
      case 'sendgrid':
        return new SendGridProvider(config.config, dependencies);
      case 'msgraph':
        return new MSGraphProvider(config.config, dependencies);
      case 'outlook':
        return new OutlookProvider(config.config, dependencies);
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }
  }

  /**
   * Send an email
   * @param {object} emailData - Email data
   * @returns {object} Send result
   */
  async send(emailData) {
    if (!this.initialized) {
      throw new Error('EmailClient not initialized. Call initialize() first.');
    }

    if (!this.activeProvider) {
      const error = new Error('No active email provider configured');
      error.code = 'NO_ACTIVE_PROVIDER';
      throw error;
    }

    // Validate email data regardless of mode
    this.activeProvider.validateEmailData(emailData);

    // Check test mode
    if (this.testMode) {
      this.logger.info('TEST MODE: Email would be sent', {
        provider: this.config.activeProvider,
        to: emailData.to,
        subject: emailData.subject,
        bodyPreview: emailData.body?.substring(0, 100)
      });

      return {
        success: true,
        messageId: 'test-' + Date.now(),
        provider: this.config.activeProvider,
        timestamp: new Date().toISOString(),
        testMode: true
      };
    }

    // Send email
    try {
      const result = await this.activeProvider.send(emailData);

      return {
        success: true,
        messageId: result.messageId,
        provider: this.config.activeProvider,
        timestamp: new Date().toISOString(),
        testMode: false
      };
    } catch (error) {
      this.logger.error('Email send failed', {
        provider: this.config.activeProvider,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        code: error.code || 'SEND_FAILED',
        provider: this.config.activeProvider,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Send a test email
   * @param {string} to - Recipient email
   * @param {string} providerName - Optional specific provider name
   * @returns {object} Send result
   */
  async sendTest(to, providerName = null) {
    if (!this.initialized) {
      throw new Error('EmailClient not initialized. Call initialize() first.');
    }

    let provider;
    let name;

    if (providerName) {
      provider = this.providers.get(providerName);
      name = providerName;

      if (!provider) {
        const error = new Error(`Provider not found: ${providerName}`);
        error.code = 'PROVIDER_NOT_FOUND';
        throw error;
      }
    } else {
      provider = this.activeProvider;
      name = this.config.activeProvider;
    }

    const testEmail = {
      to: to,
      subject: 'Test Email from Email Client',
      body: `This is a test email sent from the email client using provider: ${name}\n\nTimestamp: ${new Date().toISOString()}`,
      isHtml: false
    };

    try {
      const result = await provider.send(testEmail);

      return {
        success: true,
        messageId: result.messageId,
        provider: name,
        message: 'Test email sent successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Test email failed', {
        provider: name,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        code: error.code || 'SEND_FAILED',
        provider: name,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get client status
   * @returns {object} Status information
   */
  getStatus() {
    const providersList = [];

    for (const [name, config] of Object.entries(this.config.providers)) {
      providersList.push({
        name: name,
        type: config.type,
        enabled: config.enabled !== false,
        isActive: name === this.config.activeProvider,
        isDefault: name === this.config.defaultProvider,
        initialized: this.providers.has(name)
      });
    }

    return {
      testMode: this.testMode,
      activeProvider: this.config.activeProvider,
      defaultProvider: this.config.defaultProvider,
      providers: providersList,
      initialized: this.initialized
    };
  }

  /**
   * Get active provider name
   * @returns {string} Active provider name
   */
  getActiveProvider() {
    return this.config.activeProvider;
  }

  /**
   * Set test mode
   * @param {boolean} enabled - Enable/disable test mode
   */
  setTestMode(enabled) {
    this.testMode = enabled;
    this.logger.info(`Test mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get test mode status
   * @returns {boolean} Test mode enabled
   */
  getTestMode() {
    return this.testMode;
  }

  /**
   * Clean up resources and disconnect providers
   */
  async destroy() {
    this.logger.info('Destroying email client...');

    for (const [name, provider] of this.providers.entries()) {
      try {
        await provider.disconnect();
        this.logger.debug(`Provider disconnected: ${name}`);
      } catch (error) {
        this.logger.error(`Error disconnecting provider ${name}: ${error.message}`);
      }
    }

    this.providers.clear();
    this.activeProvider = null;
    this.initialized = false;

    this.logger.info('Email client destroyed');
  }
}

module.exports = EmailClient;