const env = require('../config/env');
const { sendError } = require('../utils/apiResponse');

const notFoundHandler = (req, res) => {
  return sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  if (env.nodeEnv !== 'test') {
    console.error('[errorHandler]', err);
  }

  return sendError(
    res,
    statusCode,
    message,
    env.nodeEnv === 'development' ? { stack: err.stack } : null
  );
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
