const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const projectRootEnvPath = path.resolve(__dirname, '../../../.env');
const cwdEnvPath = path.resolve(process.cwd(), '.env');

const resolvedEnvPath = fs.existsSync(projectRootEnvPath) ? projectRootEnvPath : cwdEnvPath;

dotenv.config({ path: resolvedEnvPath, override: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || '',
  allowVercelPreviewOrigins: process.env.ALLOW_VERCEL_PREVIEW_ORIGINS === 'true',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  adminSignupKey: process.env.ADMIN_SIGNUP_KEY || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripeMonthlyPriceId: process.env.STRIPE_MONTHLY_PRICE_ID || '',
  stripeYearlyPriceId: process.env.STRIPE_YEARLY_PRICE_ID || '',
  stripeMonthlyAmountCents: Number(process.env.STRIPE_MONTHLY_AMOUNT_CENTS) || 1999,
  stripeYearlyAmountCents: Number(process.env.STRIPE_YEARLY_AMOUNT_CENTS) || 19999,
  stripeCurrency: process.env.STRIPE_CURRENCY || 'usd',
  stripeSuccessPath: process.env.STRIPE_SUCCESS_PATH || '/user?payment=success',
  stripeCancelPath: process.env.STRIPE_CANCEL_PATH || '/user?payment=cancelled',
  winnerProofBucket: process.env.WINNER_PROOF_BUCKET || 'winner-proofs',
};

module.exports = env;