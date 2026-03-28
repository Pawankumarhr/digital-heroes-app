const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

const env = require('./config/env');
const apiRoutes = require('./routes');
const { sendSuccess } = require('./utils/apiResponse');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.use(helmet());
const allowedOrigins = new Set(
  [
    env.clientUrl,
    ...(env.corsAllowedOrigins || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ].filter(Boolean)
);

const isAllowedLocalOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

const isAllowedVercelPreviewOrigin = (origin) => {
  if (!env.allowVercelPreviewOrigins) {
    return false;
  }

  try {
    const parsed = new URL(origin);
    return parsed.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        isAllowedLocalOrigin(origin) ||
        isAllowedVercelPreviewOrigin(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(morgan('dev'));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/status', (req, res) => {
  return sendSuccess(res, 200, 'Backend API is running');
});

app.use('/api', apiRoutes);

const clientDistPath = path.resolve(process.cwd(), 'dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');
const canServeClient = env.nodeEnv === 'production' && fs.existsSync(clientIndexPath);

if (canServeClient) {
  app.use(express.static(clientDistPath));

  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(clientIndexPath);
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;