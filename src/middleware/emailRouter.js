/**
 * Email Router Middleware
 * Optional Express.js router for REST API endpoints
 */

/**
 * Create an Express router with email endpoints
 * @param {EmailClient} emailClient - Initialized email client instance
 * @param {object} options - Router options
 * @param {function} options.authMiddleware - Optional authentication middleware
 * @param {function} options.errorHandler - Optional error handler
 * @returns {Router} Express router
 */
function createEmailRouter(emailClient, options = {}) {
  // Require express dynamically (optional dependency)
  let express;
  try {
    express = require('express');
  } catch (error) {
    throw new Error('Express is required to use createEmailRouter. Install it with: npm install express');
  }

  const router = express.Router();

  // Apply auth middleware if provided
  if (options.authMiddleware) {
    router.use(options.authMiddleware);
  }

  // Helper to get action parameter
  const getAction = (req) => req.query._action;

  /**
   * POST endpoints
   */
  router.post('/', async (req, res, next) => {
    const action = getAction(req);

    try {
      switch (action) {
        case 'send':
          const result = await emailClient.send(req.body);
          return res.status(result.success ? 200 : 500).json(result);

        case 'test':
          const testResult = await emailClient.sendTest(
            req.body.to,
            req.body.providerName
          );
          return res.status(testResult.success ? 200 : 500).json(testResult);

        default:
          return res.status(400).json({
            success: false,
            error: `Unknown action: ${action}. Valid actions: send, test`,
            code: 'INVALID_ACTION',
            timestamp: new Date().toISOString()
          });
      }
    } catch (error) {
      if (options.errorHandler) {
        return options.errorHandler(error, req, res, next);
      }

      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message,
        code: error.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET endpoints
   */
  router.get('/', async (req, res, next) => {
    const action = getAction(req);

    try {
      switch (action) {
        case 'status':
          const status = emailClient.getStatus();
          return res.status(200).json({
            success: true,
            ...status,
            timestamp: new Date().toISOString()
          });

        case 'listProviders':
          const statusData = emailClient.getStatus();
          return res.status(200).json({
            success: true,
            providers: statusData.providers,
            timestamp: new Date().toISOString()
          });

        default:
          return res.status(400).json({
            success: false,
            error: `Unknown action: ${action}. Valid actions: status, listProviders`,
            code: 'INVALID_ACTION',
            timestamp: new Date().toISOString()
          });
      }
    } catch (error) {
      if (options.errorHandler) {
        return options.errorHandler(error, req, res, next);
      }

      return res.status(500).json({
        success: false,
        error: error.message,
        code: error.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}

module.exports = createEmailRouter;
