// ============================================================
// logger.middleware.js — HTTP Request Logger
// ============================================================
const morgan = require('morgan');

// Custom token for response time color-coding
morgan.token('status-colored', (req, res) => {
  const status = res.statusCode;
  if (status >= 500) return `\x1b[31m${status}\x1b[0m`; // Red
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`; // Yellow
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`; // Cyan
  return `\x1b[32m${status}\x1b[0m`;                    // Green
});

const loggerMiddleware = morgan(
  ':method :url — :response-time ms — :status-colored',
  {
    skip: (req) => req.url === '/health', // skip health checks
  }
);

module.exports = loggerMiddleware;
