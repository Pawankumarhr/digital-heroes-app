const Stripe = require('stripe');
const env = require('../config/env');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { getDbClient } = require('../utils/supabaseRequest');

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

const planCatalog = {
  monthly: {
    label: 'Digital Heroes Monthly',
    interval: 'month',
    amount: env.stripeMonthlyAmountCents,
    priceId: env.stripeMonthlyPriceId,
  },
  yearly: {
    label: 'Digital Heroes Yearly',
    interval: 'year',
    amount: env.stripeYearlyAmountCents,
    priceId: env.stripeYearlyPriceId,
  },
};

const safePath = (value, fallback) => {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return fallback;
  }
  return value;
};

const isMissingSchemaResource = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find') || message.includes('column');
};

const persistSubscriptionState = async (db, userId, state) => {
  const now = new Date().toISOString();

  const subscriptionPayload = {
    user_id: userId,
    stripe_subscription_id: state.subscriptionId || null,
    status: state.status,
    plan_interval: state.plan || null,
    current_period_end: state.currentPeriodEnd || null,
    updated_at: now,
  };

  const subscriptionUpsert = await db
    .from('subscriptions')
    .upsert(subscriptionPayload, { onConflict: 'user_id' });

  if (subscriptionUpsert.error && !isMissingSchemaResource(subscriptionUpsert.error)) {
    console.warn('[payments] subscriptions upsert failed:', subscriptionUpsert.error.message);
  }

  const profilePayload = {
    subscription_status: state.status,
    subscription_plan: state.plan || null,
    subscription_ends_at: state.currentPeriodEnd || null,
  };

  const profileUpdate = await db.from('profiles').update(profilePayload).eq('id', userId);

  if (profileUpdate.error && !isMissingSchemaResource(profileUpdate.error)) {
    console.warn('[payments] profiles subscription update failed:', profileUpdate.error.message);
  }
};

const createCheckoutSession = asyncHandler(async (req, res) => {
  if (!stripe) {
    return sendError(res, 503, 'Stripe is not configured. Set STRIPE_SECRET_KEY to enable checkout.');
  }

  const { plan = 'monthly', successPath, cancelPath } = req.body || {};
  const normalizedPlan = String(plan).toLowerCase();
  const selected = planCatalog[normalizedPlan];

  if (!selected) {
    return sendError(res, 400, 'Invalid plan. Supported plans: monthly, yearly');
  }

  const userEmail = req.user?.email;
  const userId = req.user?.id;

  if (!userEmail || !userId) {
    return sendError(res, 401, 'Unauthorized');
  }

  const lineItem = selected.priceId
    ? {
        price: selected.priceId,
        quantity: 1,
      }
    : {
        price_data: {
          currency: env.stripeCurrency,
          product_data: { name: selected.label },
          recurring: { interval: selected.interval },
          unit_amount: selected.amount,
        },
        quantity: 1,
      };

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: userEmail,
    client_reference_id: userId,
    line_items: [lineItem],
    success_url: `${env.clientUrl}${safePath(successPath, env.stripeSuccessPath)}`,
    cancel_url: `${env.clientUrl}${safePath(cancelPath, env.stripeCancelPath)}`,
    metadata: {
      userId,
      plan: normalizedPlan,
    },
  });

  return sendSuccess(res, 200, 'Checkout session created', {
    id: session.id,
    url: session.url,
    plan: normalizedPlan,
  });
});

const applyStripeEvent = async (db, event) => {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId || session.client_reference_id;
    const plan = session.metadata?.plan || null;

    if (!userId) {
      return;
    }

    await persistSubscriptionState(db, userId, {
      status: 'active',
      plan,
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
      currentPeriodEnd: null,
    });
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const userId = subscription.metadata?.userId || null;

    if (!userId) {
      return;
    }

    const periodEndUnix = subscription.current_period_end;
    const currentPeriodEnd = Number.isFinite(periodEndUnix)
      ? new Date(Number(periodEndUnix) * 1000).toISOString()
      : null;

    await persistSubscriptionState(db, userId, {
      status: event.type === 'customer.subscription.deleted' ? 'canceled' : String(subscription.status || 'active'),
      plan: subscription.metadata?.plan || null,
      subscriptionId: subscription.id || null,
      currentPeriodEnd,
    });
  }
};

const handleStripeWebhook = asyncHandler(async (req, res) => {
  if (!stripe) {
    return sendError(res, 503, 'Stripe is not configured');
  }

  let event = req.body;

  if (env.stripeWebhookSecret) {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return sendError(res, 400, 'Missing stripe-signature header');
    }

    try {
      event = stripe.webhooks.constructEvent(req.body, signature, env.stripeWebhookSecret);
    } catch (error) {
      return sendError(res, 400, 'Invalid webhook signature', error.message);
    }
  }

  if (!env.stripeWebhookSecret && Buffer.isBuffer(event)) {
    try {
      event = JSON.parse(event.toString('utf8'));
    } catch (error) {
      return sendError(res, 400, 'Invalid webhook payload', error.message);
    }
  }

  const db = getDbClient(req);
  await applyStripeEvent(db, event);

  return sendSuccess(res, 200, 'Webhook processed', { received: true });
});

const getSubscriptionStatus = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const userId = req.user.id;

  const [subscriptionRes, profileRes] = await Promise.all([
    db
      .from('subscriptions')
      .select('status, plan_interval, current_period_end, stripe_subscription_id, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('profiles')
      .select('subscription_status, subscription_plan, subscription_ends_at')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  if (subscriptionRes.error && !isMissingSchemaResource(subscriptionRes.error)) {
    return sendError(res, 500, 'Failed to fetch subscription status', subscriptionRes.error.message);
  }

  if (profileRes.error && !isMissingSchemaResource(profileRes.error)) {
    return sendError(res, 500, 'Failed to fetch profile subscription status', profileRes.error.message);
  }

  const subscription = subscriptionRes.data || null;
  const profile = profileRes.data || null;

  return sendSuccess(res, 200, 'Subscription status fetched successfully', {
    status: subscription?.status || profile?.subscription_status || 'inactive',
    plan: subscription?.plan_interval || profile?.subscription_plan || null,
    currentPeriodEnd: subscription?.current_period_end || profile?.subscription_ends_at || null,
    stripeSubscriptionId: subscription?.stripe_subscription_id || null,
  });
});

module.exports = {
  createCheckoutSession,
  handleStripeWebhook,
  getSubscriptionStatus,
};