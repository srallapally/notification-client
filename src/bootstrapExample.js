// Example: Express app bootstrap with EmailClient initialization
//
// This shows how to wire up the EmailClient before the server starts.
// Adapt the provider config to your environment.

const express = require('express');
const { configure } = require('./lib/emailClientInit');

async function startServer() {
    // Initialize EmailClient before registering routes
    await configure({
        providers: {
            gmail: {
                type: 'gmail',
                enabled: true,
                config: {
                    fromAddress: 'noreply@example.com',
                    fromName: 'IGA Notifications',
                    timeout: 30000,
                    retry: {
                        maxAttempts: 3,
                        baseDelay: 1000,
                        maxDelay: 10000
                    },
                    credentials: {
                        // For production, use secretStore injection instead of inline
                        username: process.env.EMAIL_USERNAME,
                        password: process.env.EMAIL_PASSWORD
                    }
                }
            }
        },
        activeProvider: 'gmail',
        testMode: process.env.EMAIL_TEST_MODE === 'true'
    });

    const app = express();
    app.use(express.json());

    // Register routes (notification.js handlers can now use getClient())
    const notification = require('./notification');
    // ... register notification routes ...

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});