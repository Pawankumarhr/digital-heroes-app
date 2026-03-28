const app = require('./app');
const env = require('./config/env');
const connectToDatabase = require('./config/db');

const startServer = async () => {
  try {
    await connectToDatabase();

    app.listen(env.port, () => {
      console.log(`[server] Running on port ${env.port} (${env.nodeEnv})`);
    });
  } catch (error) {
    console.error('[server] Failed to start:', error);
    process.exit(1);
  }
};

startServer();