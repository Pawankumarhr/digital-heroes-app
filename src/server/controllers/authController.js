const { supabasePublic, supabaseAdmin } = require('../config/supabase');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { createNotification } = require('../utils/notificationService');

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const normalizePhone = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) {
    return '';
  }

  const compact = raw.replace(/[\s()-]/g, '');
  const withPlus = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;

  if (!/^\+?[1-9]\d{7,14}$/.test(withPlus)) {
    return '';
  }

  return withPlus.startsWith('+') ? withPlus : `+${withPlus}`;
};

const phoneToAuthEmail = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `phone_${digits}@phone.digitalheroes.local` : '';
};

const isValidPassword = (password) => {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
};

const toAuthSessionPayload = (data) => {
  return {
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: {
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.full_name || null,
    },
  };
};

const performSignup = async ({
  req,
  res,
  role,
  requireInvite = false,
  inviteKey,
}) => {
  const { name, email, phone, password, preferredCharityId, charityContributionPercent } = req.body;

  if (!name || !password) {
    return sendError(res, 400, 'name and password are required');
  }

  const normalizedEmail = String(email || '').toLowerCase().trim();
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedEmail && !normalizedPhone) {
    return sendError(res, 400, 'Either email or phone is required');
  }

  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return sendError(res, 400, 'Invalid email format');
  }

  if (phone && !normalizedPhone) {
    return sendError(res, 400, 'Invalid phone format. Use international format, e.g. +15551234567');
  }

  const authEmail = normalizedEmail || phoneToAuthEmail(normalizedPhone);

  if (!authEmail) {
    return sendError(res, 400, 'Unable to process phone number for authentication');
  }

  if (!isValidPassword(String(password))) {
    return sendError(res, 400, 'Password must be at least 8 characters and include letters and numbers');
  }

  let normalizedPreferredCharityId = null;
  if (preferredCharityId) {
    const value = String(preferredCharityId).trim();
    if (!uuidRegex.test(value)) {
      return sendError(res, 400, 'preferredCharityId must be a valid UUID');
    }
    normalizedPreferredCharityId = value;
  }

  let normalizedContributionPercent = 10;
  if (charityContributionPercent !== undefined && charityContributionPercent !== null && String(charityContributionPercent).trim() !== '') {
    const parsed = Number(charityContributionPercent);
    if (!Number.isFinite(parsed) || parsed < 10 || parsed > 100) {
      return sendError(res, 400, 'charityContributionPercent must be between 10 and 100');
    }
    normalizedContributionPercent = Math.round(parsed);
  }

  if (requireInvite) {
    if (!env.adminSignupKey) {
      return sendError(res, 500, 'ADMIN_SIGNUP_KEY is not configured on the server');
    }

    if (!inviteKey || String(inviteKey) !== String(env.adminSignupKey)) {
      return sendError(res, 403, 'Invalid admin invite key');
    }

    if (!supabaseAdmin) {
      return sendError(
        res,
        500,
        'SUPABASE_SERVICE_ROLE_KEY is required for secure admin signup provisioning'
      );
    }
  }

  const { data, error } = await supabasePublic.auth.signUp({
    email: authEmail,
    password: String(password),
    options: {
      data: {
        full_name: String(name).trim(),
        phone: normalizedPhone || null,
      },
    },
  });

  if (error) {
    const message = String(error.message || '').toLowerCase();

    if (message.includes('rate limit') || message.includes('already registered')) {
      const loginAttempt = await supabasePublic.auth.signInWithPassword({
        email: authEmail,
        password: String(password),
      });

      if (!loginAttempt.error && loginAttempt.data.user && loginAttempt.data.session) {
        return sendSuccess(
          res,
          200,
          'Signup is currently limited by Supabase; logged into your existing account instead',
          toAuthSessionPayload(loginAttempt.data)
        );
      }

      return sendError(
        res,
        429,
        'Supabase signup emails are temporarily rate-limited. Please switch to Login for existing accounts, or wait 60 seconds and try Signup again.'
      );
    }

    return sendError(res, 400, error.message);
  }

  if (data.user && supabaseAdmin) {
    await supabaseAdmin.from('profiles').upsert(
      {
        id: data.user.id,
        full_name: String(name).trim(),
        email: authEmail,
        role,
        preferred_charity_id: normalizedPreferredCharityId,
        charity_contribution_percent: normalizedContributionPercent,
        is_active: true,
      },
      { onConflict: 'id' }
    );

    await createNotification(req, {
      userId: data.user.id,
      channel: 'email',
      eventType: 'auth.signup',
      subject: 'Welcome to Digital Heroes',
      body: 'Your account has been created successfully.',
      metadata: {
        role,
      },
    });
  }

  return sendSuccess(res, 201, 'Signup successful', {
    user: data.user
      ? {
          id: data.user.id,
          email: data.user.email,
          full_name: data.user.user_metadata?.full_name || String(name).trim(),
        }
      : null,
    session: data.session
      ? {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        }
      : null,
  });
};

const signup = asyncHandler(async (req, res) => {
  return performSignup({
    req,
    res,
    role: 'admin',
    requireInvite: true,
    inviteKey: req.body.inviteKey,
  });
});

const register = signup;

const userRegister = asyncHandler(async (req, res) => {
  return performSignup({
    req,
    res,
    role: 'user',
    requireInvite: false,
  });
});

const login = asyncHandler(async (req, res) => {
  const { identifier, email, phone, password } = req.body;

  const identifierValue = String(identifier || email || phone || '').trim();

  if (!identifierValue || !password) {
    return sendError(res, 400, 'identifier (email or phone) and password are required');
  }

  const maybePhone = normalizePhone(identifierValue);
  const normalizedEmail = maybePhone
    ? phoneToAuthEmail(maybePhone)
    : String(identifierValue).toLowerCase().trim();

  if (!isValidEmail(normalizedEmail)) {
    return sendError(res, 400, 'Invalid email or phone format');
  }

  const { data, error } = await supabasePublic.auth.signInWithPassword({
    email: normalizedEmail,
    password: String(password),
  });

  if (error || !data.user || !data.session) {
    return sendError(res, 401, 'Invalid email or password');
  }

  return sendSuccess(res, 200, 'Login successful', {
    ...toAuthSessionPayload(data),
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email, redirectPath } = req.body;

  if (!email) {
    return sendError(res, 400, 'email is required');
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  if (!isValidEmail(normalizedEmail)) {
    return sendError(res, 400, 'Invalid email format');
  }

  let safeRedirectPath = '/admin';
  if (typeof redirectPath === 'string' && redirectPath.startsWith('/')) {
    safeRedirectPath = redirectPath;
  }

  const { error } = await supabasePublic.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${env.clientUrl}${safeRedirectPath}`,
  });

  if (error) {
    return sendError(res, 400, error.message);
  }

  return sendSuccess(
    res,
    200,
    'If an account exists for this email, a password reset link has been sent',
    { email: normalizedEmail }
  );
});

const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, 'Current user fetched successfully', req.user);
});

const updatePreferences = asyncHandler(async (req, res) => {
  if (!supabaseAdmin) {
    return sendError(res, 500, 'SUPABASE_SERVICE_ROLE_KEY is required to update profile preferences');
  }

  const { preferredCharityId, charityContributionPercent } = req.body || {};
  const patch = {};

  if (preferredCharityId !== undefined) {
    const value = String(preferredCharityId || '').trim();
    if (value && !uuidRegex.test(value)) {
      return sendError(res, 400, 'preferredCharityId must be a valid UUID');
    }
    patch.preferred_charity_id = value || null;
  }

  if (charityContributionPercent !== undefined) {
    const parsed = Number(charityContributionPercent);
    if (!Number.isFinite(parsed) || parsed < 10 || parsed > 100) {
      return sendError(res, 400, 'charityContributionPercent must be between 10 and 100');
    }
    patch.charity_contribution_percent = Math.round(parsed);
  }

  if (Object.keys(patch).length === 0) {
    return sendError(res, 400, 'No valid preference fields provided');
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', req.user.id)
    .select('id, preferred_charity_id, charity_contribution_percent')
    .maybeSingle();

  if (error) {
    return sendError(res, 400, 'Failed to update preferences', error.message);
  }

  return sendSuccess(res, 200, 'Preferences updated successfully', data);
});

module.exports = {
  signup,
  register,
  userRegister,
  login,
  forgotPassword,
  me,
  updatePreferences,
};
