# notification-client

Multi-provider email client library for Node.js. Supports Gmail (SMTP), Outlook (SMTP), SendGrid (API), and Microsoft Graph (API) with configurable timeouts, retry with exponential backoff, and credential protection.

## Installation

```bash
npm install
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `axios` | HTTP client for SendGrid and MSGraph providers |
| `nodemailer` | SMTP transport for Gmail and Outlook providers |
| `validator` | Email address validation |
| `winston` | Logging (used by the IGA application layer) |

## Quick Start

```javascript
const EmailClient = require('./src/client');

const client = new EmailClient({
  providers: {
    gmail: {
      type: 'gmail',
      enabled: true,
      config: {
        fromAddress: 'noreply@example.com',
        fromName: 'Notifications',
        credentials: {
          username: process.env.EMAIL_USERNAME,
          password: process.env.EMAIL_PASSWORD
        }
      }
    }
  },
  activeProvider: 'gmail'
});

await client.initialize();

const result = await client.send({
  to: 'recipient@example.com',
  subject: 'Hello',
  body: '<h1>Hello World</h1>',
  isHtml: true
});
```

## Architecture

```
src/
├── client.js                    # EmailClient - main entry point
├── index.js                     # Library exports
├── notification.js              # IGA notification handler (integration layer)
├── bootstrapExample.js          # Express startup example
├── lib/
│   └── emailClientInit.js       # Singleton initialization module
└── config/
    └── providers/
        ├── baseProvider.js      # Abstract base with retry, validation, credential protection
        ├── gmailProvider.js     # Gmail via SMTP (nodemailer)
        ├── outlookProvider.js   # Outlook via SMTP (nodemailer)
        ├── sendgridProvider.js  # SendGrid via REST API (axios)
        ├── msgraphProvider.js   # Microsoft Graph via REST API (axios)
        └── index.js             # Provider exports
```

## Providers

### Gmail (SMTP)

```javascript
{
  type: 'gmail',
  config: {
    fromAddress: 'noreply@example.com',
    fromName: 'My App',
    smtp: {                          // optional, defaults shown
      host: 'smtp.gmail.com',
      port: 587,
      secure: false
    },
    credentials: {
      username: 'user@gmail.com',
      password: 'app-password'
    }
  }
}
```

### Outlook (SMTP)

```javascript
{
  type: 'outlook',
  config: {
    fromAddress: 'noreply@example.com',
    fromName: 'My App',
    smtp: {                          // optional, defaults shown
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false
    },
    credentials: {
      username: 'user@outlook.com',
      password: 'password'
    }
  }
}
```

### SendGrid (API)

```javascript
{
  type: 'sendgrid',
  config: {
    fromAddress: 'noreply@example.com',
    fromName: 'My App',
    credentials: {
      apiKey: 'SG.xxxx'
    }
  }
}
```

### Microsoft Graph (API)

```javascript
{
  type: 'msgraph',
  config: {
    fromAddress: 'noreply@example.com',
    tenantId: 'your-tenant-id',
    clientId: 'your-client-id',
    credentials: {
      clientSecret: 'your-client-secret'
    }
  }
}
```

## Configuration

### Timeouts

All providers support a configurable timeout. Default is 30 seconds.

```javascript
config: {
  timeout: 45000,  // milliseconds
  // ...
}
```

SMTP providers (Gmail, Outlook) apply this to `connectionTimeout`, `greetingTimeout`, and `socketTimeout`. API providers (SendGrid, MSGraph) apply it to the axios request timeout.

### Retry

All providers retry on transient failures with exponential backoff and jitter.

```javascript
config: {
  retry: {
    maxAttempts: 3,     // default: 3
    baseDelay: 1000,    // default: 1000ms
    maxDelay: 10000     // default: 10000ms
  },
  // ...
}
```

Retryable conditions:
- HTTP 429 (rate limit) — honors `Retry-After` header
- HTTP 502, 503, 504 (transient server errors)
- Network errors: `ECONNABORTED`, `ETIMEDOUT`, `ECONNRESET`
- SMTP 4xx transient errors

Non-retryable conditions:
- HTTP 400 (bad request)
- HTTP 401, 403 (authentication/authorization)
- Validation errors

When retries are exhausted on a 429, the error is thrown with `code: 'RATE_LIMITED'`.

### Credentials

Credentials are loaded through one of three mechanisms, checked in order:

1. **Secret store** — if a `secretStore` is injected and `credentials.secretName` is set
2. **Encryption service** — if an `encryption` service is injected and `credentials.encrypted` is set
3. **Inline** — plain values in the config object (development only)

Credentials are wrapped in a non-serializable accessor. Direct property access works (`credentials.apiKey`), but `JSON.stringify()` and `console.log()` output `[REDACTED]` for all values.

### Test Mode

Test mode validates email data and runs the full flow but skips the actual provider send call.

```javascript
const client = new EmailClient({
  // ...
  testMode: true
});

// Or toggle at runtime:
client.setTestMode(true);
```

## Integration with IGA Service

The library is designed to be initialized once at service startup and shared across request handlers.

### Bootstrap (Express)

```javascript
const { configure } = require('./src/lib/emailClientInit');

async function startServer() {
  await configure({
    providers: { /* ... */ },
    activeProvider: 'gmail',
    testMode: process.env.EMAIL_TEST_MODE === 'true'
  });

  const app = express();
  // ... register routes ...
  app.listen(3000);
}
```

### Sending (notification.js)

```javascript
const { getClient } = require('./lib/emailClientInit');

async function sendNotificationTemplate(notificationId, object, to, cc) {
  const emailClient = getClient();
  const result = await emailClient.send({
    to,
    cc: cc || undefined,
    subject: object.subject,
    body: object.html || object.text,
    isHtml: !!object.html,
    attachments: object.attachments
  });
  return result;
}
```

## API Reference

### `new EmailClient(options)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `providers` | `object` | Yes | Provider configurations keyed by name |
| `activeProvider` | `string` | Yes | Name of the provider to use for sending |
| `testMode` | `boolean` | No | Skip actual sends (default: `false`) |
| `logger` | `object` | No | Logger with `debug/info/warn/error` methods |
| `secretStore` | `object` | No | Secret store with `getSecret(name)` method |
| `encryption` | `object` | No | Encryption service with `decrypt(value)` method |

### `client.initialize()` → `Promise<void>`

Initializes all enabled providers. Must be called before `send()`. Safe to call concurrently — only one initialization runs. Retryable on failure.

### `client.send(emailData)` → `Promise<object>`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | `string \| string[]` | Yes | Recipient(s) |
| `subject` | `string` | Yes | Email subject |
| `body` | `string` | Yes | Email body (text or HTML) |
| `isHtml` | `boolean` | No | Treat body as HTML (default: `false`) |
| `cc` | `string \| string[]` | No | CC recipients |
| `bcc` | `string \| string[]` | No | BCC recipients |
| `replyTo` | `string` | No | Reply-to address |
| `attachments` | `array` | No | Array of `{ filename, content, contentType }` |

Returns `{ success, messageId, provider, timestamp, testMode }` on success, or `{ success: false, error, code, provider, timestamp }` on failure.

### `client.destroy()` → `Promise<void>`

Disconnects all providers and cleans up resources.

### Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_REQUIRED_FIELD` | `to`, `subject`, or `body` missing |
| `INVALID_EMAIL_ADDRESS` | Failed email validation |
| `NO_ACTIVE_PROVIDER` | No active provider configured |
| `AUTH_FAILED` | Provider authentication failed |
| `SEND_FAILED` | Email send failed (non-retryable or retries exhausted) |
| `RATE_LIMITED` | 429 received, retries exhausted |

## Requirements

- Node.js >= 14.0.0