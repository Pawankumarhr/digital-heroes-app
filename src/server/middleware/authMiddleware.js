const { supabasePublic, supabaseAdmin, getSupabaseForToken } = require('../config/supabase');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const token = authHeader.split(' ')[1];
    const { data: authData, error: authError } = await supabasePublic.auth.getUser(token);

    if (authError || !authData.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const user = authData.user;
    const scopedClient = supabaseAdmin || getSupabaseForToken(token);

    const { data: profile } = await scopedClient
      .from('profiles')
      .select('id, full_name, email, role, is_active, preferred_charity_id, charity_contribution_percent')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && profile.is_active === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive',
      });
    }

    req.user = {
      id: user.id,
      name: profile?.full_name || user.user_metadata?.full_name || null,
      email: profile?.email || user.email,
      role: profile?.role || 'user',
      preferredCharityId: profile?.preferred_charity_id || null,
      charityContributionPercent:
        typeof profile?.charity_contribution_percent === 'number'
          ? profile.charity_contribution_percent
          : null,
    };
    req.authToken = token;

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
      });
    }

    return next();
  };
};

module.exports = {
  protect,
  authorizeRoles,
};