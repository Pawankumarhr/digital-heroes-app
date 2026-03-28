const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const drawStatusSet = new Set(['draft', 'simulated', 'published', 'closed']);
const drawTypeSet = new Set(['random', 'algorithm']);
const winnerPayoutStatusSet = new Set(['pending', 'paid', 'failed']);
const winnerVerificationStatusSet = new Set(['pending', 'submitted', 'approved', 'rejected']);

const sendValidationError = (res, message) => {
  return res.status(400).json({
    success: false,
    message,
  });
};

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const validateObjectIdParam = (paramName = 'id') => {
  return (req, res, next) => {
    const value = req.params[paramName];

    if (!uuidRegex.test(String(value || ''))) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName}`,
      });
    }

    return next();
  };
};

const validateDrawPayload = (allowPartial = false) => {
  return (req, res, next) => {
    if (!isPlainObject(req.body)) {
      return sendValidationError(res, 'Request body must be a JSON object');
    }

    const sanitized = {};

    if ('title' in req.body) {
      const title = String(req.body.title || '').trim();
      if (title.length < 3) {
        return sendValidationError(res, 'Draw title must be at least 3 characters long');
      }
      sanitized.title = title;
    }

    if ('draw_month' in req.body) {
      const drawMonth = String(req.body.draw_month || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(drawMonth)) {
        return sendValidationError(res, 'draw_month must be in YYYY-MM-DD format');
      }
      sanitized.draw_month = drawMonth;
    }

    if ('status' in req.body) {
      const status = String(req.body.status || '').trim().toLowerCase();
      if (!drawStatusSet.has(status)) {
        return sendValidationError(res, 'status must be one of: draft, simulated, published, closed');
      }
      sanitized.status = status;
    }

    if ('draw_type' in req.body) {
      const drawType = String(req.body.draw_type || '').trim().toLowerCase();
      if (!drawTypeSet.has(drawType)) {
        return sendValidationError(res, 'draw_type must be one of: random, algorithm');
      }
      sanitized.draw_type = drawType;
    }

    if (!allowPartial) {
      if (!('title' in sanitized) || !('draw_month' in sanitized)) {
        return sendValidationError(res, 'title and draw_month are required');
      }

      sanitized.status = sanitized.status || 'draft';
      sanitized.draw_type = sanitized.draw_type || 'random';
    } else if (Object.keys(sanitized).length === 0) {
      return sendValidationError(res, 'At least one valid draw field is required for update');
    }

    req.body = sanitized;
    return next();
  };
};

const validateScorePayload = (allowPartial = false) => {
  return (req, res, next) => {
    if (!isPlainObject(req.body)) {
      return sendValidationError(res, 'Request body must be a JSON object');
    }

    const sanitized = {};

    if ('user_id' in req.body) {
      const userId = String(req.body.user_id || '').trim();
      if (!uuidRegex.test(userId)) {
        return sendValidationError(res, 'user_id must be a valid UUID');
      }
      sanitized.user_id = userId;
    }

    if ('score_value' in req.body) {
      const scoreValue = Number(req.body.score_value);
      if (!Number.isFinite(scoreValue) || scoreValue < 1 || scoreValue > 45) {
        return sendValidationError(res, 'score_value must be between 1 and 45');
      }
      sanitized.score_value = scoreValue;
    }

    if ('score_date' in req.body) {
      const scoreDate = String(req.body.score_date || '').trim();
      const parsed = new Date(scoreDate);
      if (Number.isNaN(parsed.getTime())) {
        return sendValidationError(res, 'score_date must be a valid date/time string');
      }
      sanitized.score_date = parsed.toISOString();
    }

    if ('course_name' in req.body) {
      const courseName = String(req.body.course_name || '').trim();
      if (courseName.length < 2) {
        return sendValidationError(res, 'course_name must be at least 2 characters long');
      }
      sanitized.course_name = courseName;
    }

    if (!allowPartial) {
      if (!('user_id' in sanitized) || !('score_value' in sanitized) || !('score_date' in sanitized)) {
        return sendValidationError(res, 'user_id, score_value, and score_date are required');
      }
    } else if (Object.keys(sanitized).length === 0) {
      return sendValidationError(res, 'At least one valid score field is required for update');
    }

    req.body = sanitized;
    return next();
  };
};

const validateCharityPayload = (allowPartial = false) => {
  return (req, res, next) => {
    if (!isPlainObject(req.body)) {
      return sendValidationError(res, 'Request body must be a JSON object');
    }

    const sanitized = {};

    if ('name' in req.body) {
      const name = String(req.body.name || '').trim();
      if (name.length < 2) {
        return sendValidationError(res, 'Charity name must be at least 2 characters long');
      }
      sanitized.name = name;
    }

    if ('slug' in req.body) {
      const slug = String(req.body.slug || '').trim().toLowerCase();
      if (!slugRegex.test(slug)) {
        return sendValidationError(res, 'Slug must contain lowercase letters, numbers, and hyphens');
      }
      sanitized.slug = slug;
    }

    if (!allowPartial) {
      if (!('name' in sanitized) || !('slug' in sanitized)) {
        return sendValidationError(res, 'name and slug are required');
      }
    } else if (Object.keys(sanitized).length === 0) {
      return sendValidationError(res, 'At least one valid charity field is required for update');
    }

    req.body = sanitized;
    return next();
  };
};

const validateWinnerPayload = (allowPartial = false) => {
  return (req, res, next) => {
    if (!isPlainObject(req.body)) {
      return sendValidationError(res, 'Request body must be a JSON object');
    }

    const sanitized = {};

    if ('user_id' in req.body) {
      const userId = String(req.body.user_id || '').trim();
      if (!uuidRegex.test(userId)) {
        return sendValidationError(res, 'user_id must be a valid UUID');
      }
      sanitized.user_id = userId;
    }

    if ('draw_id' in req.body) {
      const drawId = String(req.body.draw_id || '').trim();
      if (!uuidRegex.test(drawId)) {
        return sendValidationError(res, 'draw_id must be a valid UUID');
      }
      sanitized.draw_id = drawId;
    }

    if ('charity_id' in req.body) {
      const charityId = String(req.body.charity_id || '').trim();
      if (!uuidRegex.test(charityId)) {
        return sendValidationError(res, 'charity_id must be a valid UUID');
      }
      sanitized.charity_id = charityId;
    }

    if ('prize_amount' in req.body) {
      const prizeAmount = Number(req.body.prize_amount);
      if (!Number.isFinite(prizeAmount) || prizeAmount <= 0) {
        return sendValidationError(res, 'prize_amount must be greater than 0');
      }
      sanitized.payout_amount_cents = Math.round(prizeAmount * 100);
    }

    if ('payout_amount_cents' in req.body) {
      const payoutAmountCents = Number(req.body.payout_amount_cents);
      if (!Number.isFinite(payoutAmountCents) || payoutAmountCents < 0) {
        return sendValidationError(res, 'payout_amount_cents must be greater than or equal to 0');
      }
      sanitized.payout_amount_cents = Math.round(payoutAmountCents);
    }

    if ('payout_status' in req.body) {
      const payoutStatus = String(req.body.payout_status || '').trim().toLowerCase();
      if (!winnerPayoutStatusSet.has(payoutStatus)) {
        return sendValidationError(res, 'payout_status must be one of: pending, paid, failed');
      }
      sanitized.payout_status = payoutStatus;
    }

    if ('verification_status' in req.body) {
      const verificationStatus = String(req.body.verification_status || '').trim().toLowerCase();
      if (!winnerVerificationStatusSet.has(verificationStatus)) {
        return sendValidationError(
          res,
          'verification_status must be one of: pending, submitted, approved, rejected'
        );
      }
      sanitized.verification_status = verificationStatus;
    }

    if ('matched_numbers' in req.body) {
      const matchedNumbers = Number(req.body.matched_numbers);
      if (!Number.isFinite(matchedNumbers) || matchedNumbers < 0 || matchedNumbers > 5) {
        return sendValidationError(res, 'matched_numbers must be between 0 and 5');
      }
      sanitized.matched_numbers = Math.round(matchedNumbers);
    }

    if ('tier' in req.body) {
      const tier = Number(req.body.tier);
      if (![3, 4, 5].includes(tier)) {
        return sendValidationError(res, 'tier must be one of: 3, 4, 5');
      }
      sanitized.tier = tier;
    }

    if ('proof_file_url' in req.body) {
      const proofFileUrl = String(req.body.proof_file_url || '').trim();
      if (proofFileUrl && !/^https?:\/\//i.test(proofFileUrl)) {
        return sendValidationError(res, 'proof_file_url must be a valid http/https URL');
      }
      sanitized.proof_file_url = proofFileUrl || null;
    }

    if ('proof_notes' in req.body) {
      const proofNotes = String(req.body.proof_notes || '').trim();
      sanitized.proof_notes = proofNotes || null;
    }

    if (!allowPartial) {
      if (
        !('user_id' in sanitized) ||
        !('draw_id' in sanitized) ||
        !('charity_id' in sanitized) ||
        !('matched_numbers' in sanitized) ||
        !('tier' in sanitized)
      ) {
        return sendValidationError(
          res,
          'user_id, draw_id, charity_id, matched_numbers, and tier are required'
        );
      }

      sanitized.payout_amount_cents = sanitized.payout_amount_cents || 0;
      sanitized.payout_status = sanitized.payout_status || 'pending';
      sanitized.verification_status = sanitized.verification_status || 'pending';
    } else if (Object.keys(sanitized).length === 0) {
      return sendValidationError(res, 'At least one valid winner field is required for update');
    }

    req.body = sanitized;
    return next();
  };
};

const validateContactPayload = () => {
  return (req, res, next) => {
    if (!isPlainObject(req.body)) {
      return sendValidationError(res, 'Request body must be a JSON object');
    }

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const message = String(req.body.message || '').trim();

    if (name.length < 2) {
      return sendValidationError(res, 'Name must be at least 2 characters long');
    }
    if (!emailRegex.test(email)) {
      return sendValidationError(res, 'Please provide a valid email address');
    }
    if (message.length < 10) {
      return sendValidationError(res, 'Message must be at least 10 characters long');
    }

    req.body = {
      name,
      email,
      message,
    };

    return next();
  };
};

module.exports = {
  validateObjectIdParam,
  validateScorePayload,
  validateDrawPayload,
  validateCharityPayload,
  validateWinnerPayload,
  validateContactPayload,
};