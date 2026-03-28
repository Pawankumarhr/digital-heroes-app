const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getDbClient } = require('../utils/supabaseRequest');
const { parseListQuery, paginationMeta, buildIlikeOr } = require('../utils/listQuery');
const { logAuditEvent } = require('../utils/auditLogger');
const { createNotification } = require('../utils/notificationService');
const { supabaseAdmin } = require('../config/supabase');
const env = require('../config/env');

const winnerSelect = '*';
const MAX_PROOF_UPLOAD_BYTES = 5 * 1024 * 1024;

const isMissingSchemaResource = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find') || message.includes('relation');
};

const safeFileName = (value) => {
  return String(value || 'proof.bin')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120) || 'proof.bin';
};

const toBufferFromBase64Payload = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1].trim().toLowerCase(),
      buffer: Buffer.from(dataUrlMatch[2], 'base64'),
    };
  }

  return {
    mimeType: null,
    buffer: Buffer.from(raw, 'base64'),
  };
};

const uploadWinnerProofFile = async ({ winner, proofFileDataBase64, proofFileName, proofMimeType }) => {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for proof uploads');
  }

  const decoded = toBufferFromBase64Payload(proofFileDataBase64);
  if (!decoded || !decoded.buffer || decoded.buffer.length === 0) {
    throw new Error('proofFileDataBase64 must contain valid base64 file content');
  }

  if (decoded.buffer.length > MAX_PROOF_UPLOAD_BYTES) {
    throw new Error('Proof file must be 5MB or smaller');
  }

  const fileName = safeFileName(proofFileName || `proof-${winner.id}.bin`);
  const path = `${winner.user_id}/${winner.id}/${Date.now()}-${fileName}`;
  const contentType = String(proofMimeType || decoded.mimeType || 'application/octet-stream').trim();
  const bucket = env.winnerProofBucket;

  const uploadResult = await supabaseAdmin.storage.from(bucket).upload(path, decoded.buffer, {
    contentType,
    upsert: true,
  });

  if (uploadResult.error) {
    throw new Error(`Failed to upload proof file: ${uploadResult.error.message}`);
  }

  const publicUrlResult = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  const publicUrl = publicUrlResult?.data?.publicUrl;

  return publicUrl || `supabase://${bucket}/${path}`;
};

const recordCharityContribution = async ({ db, winner }) => {
  const ledgerDb = supabaseAdmin || db;
  const payoutAmountCents = Math.max(0, Math.round(Number(winner.payout_amount_cents || 0)));

  const { data: profile } = await ledgerDb
    .from('profiles')
    .select('charity_contribution_percent')
    .eq('id', winner.user_id)
    .maybeSingle();

  const configuredPercent = Number(profile?.charity_contribution_percent);
  const contributionPercent = Number.isFinite(configuredPercent)
    ? Math.max(10, Math.min(100, Math.round(configuredPercent)))
    : 10;

  const charityAmountCents = Math.round((payoutAmountCents * contributionPercent) / 100);
  const playerAmountCents = Math.max(0, payoutAmountCents - charityAmountCents);

  const payload = {
    user_id: winner.user_id,
    winner_id: winner.id,
    draw_id: winner.draw_id,
    charity_id: winner.charity_id,
    contribution_percent: contributionPercent,
    total_payout_cents: payoutAmountCents,
    charity_amount_cents: charityAmountCents,
    player_amount_cents: playerAmountCents,
    status: 'recorded',
  };

  let { error } = await ledgerDb.from('charity_contributions').upsert(payload, { onConflict: 'winner_id' });

  if (error && !isMissingSchemaResource(error)) {
    const message = String(error.message || '').toLowerCase();

    if (message.includes('on conflict') || message.includes('constraint')) {
      const existing = await ledgerDb
        .from('charity_contributions')
        .select('id')
        .eq('winner_id', winner.id)
        .maybeSingle();

      if (!existing.error && existing.data?.id) {
        const fallbackUpdate = await ledgerDb
          .from('charity_contributions')
          .update(payload)
          .eq('id', existing.data.id);
        error = fallbackUpdate.error || null;
      } else {
        const fallbackInsert = await ledgerDb.from('charity_contributions').insert([payload]);
        error = fallbackInsert.error || null;
      }
    }
  }

  if (error && !isMissingSchemaResource(error)) {
    console.warn('[winner] Failed to record charity contribution:', error.message);
  }

  return {
    contributionPercent,
    charityAmountCents,
    playerAmountCents,
  };
};

const updateWinnerVerificationStatusWithFallback = async ({ db, winnerId, verifierId, decision, notes }) => {
  const statusCandidates =
    decision === 'approved' ? ['approved', 'verified', 'accepted'] : ['rejected', 'declined', 'failed'];

  let lastError = null;

  for (const statusValue of statusCandidates) {
    const patch = {
      verification_status: statusValue,
      verified_by: verifierId,
      verified_at: new Date().toISOString(),
      proof_notes: notes ? String(notes).trim() : null,
    };

    const result = await db
      .from('winners')
      .update(patch)
      .eq('id', winnerId)
      .select(winnerSelect)
      .maybeSingle();

    if (!result.error) {
      return {
        data: result.data,
        error: null,
        patch,
      };
    }

    lastError = result.error;
    const message = String(result.error?.message || '').toLowerCase();
    if (!message.includes('enum')) {
      break;
    }
  }

  return {
    data: null,
    error: lastError,
    patch: null,
  };
};

const updateWinnerPayoutStatusWithFallback = async ({
  db,
  winnerId,
  markerId,
  payoutReference,
  payoutProvider,
}) => {
  const statusCandidates = ['paid', 'completed', 'processed', 'success'];
  let lastError = null;

  for (const statusValue of statusCandidates) {
    const patch = {
      payout_status: statusValue,
      paid_at: new Date().toISOString(),
      payout_marked_by: markerId,
      payout_reference: payoutReference ? String(payoutReference).trim() : null,
      payout_provider: payoutProvider ? String(payoutProvider).trim().toLowerCase() : 'stripe',
    };

    const result = await db
      .from('winners')
      .update(patch)
      .eq('id', winnerId)
      .select(winnerSelect)
      .maybeSingle();

    if (!result.error) {
      return {
        data: result.data,
        error: null,
        patch,
      };
    }

    lastError = result.error;
    const message = String(result.error?.message || '').toLowerCase();
    if (!message.includes('enum')) {
      break;
    }
  }

  return {
    data: null,
    error: lastError,
    patch: null,
  };
};

const toApiWinner = (row) => {
  if (!row) {
    return row;
  }

  return {
    ...row,
    prize_amount: Number(row.payout_amount_cents || 0) / 100,
  };
};

const normalizeCreateOrUpdatePayload = (payload) => {
  const next = { ...payload };

  if (Object.prototype.hasOwnProperty.call(next, 'prize_amount') && !Object.prototype.hasOwnProperty.call(next, 'payout_amount_cents')) {
    next.payout_amount_cents = Math.round(Number(next.prize_amount) * 100);
    delete next.prize_amount;
  }

  return next;
};

const listWinners = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const parsed = parseListQuery(req, {
    defaultSortBy: 'created_at',
    allowedSortBy: [
      'created_at',
      'matched_numbers',
      'tier',
      'payout_amount_cents',
      'payout_status',
      'verification_status',
      'user_id',
      'draw_id',
      'charity_id',
    ],
  });

  let query = db
    .from('winners')
    .select(winnerSelect, { count: 'exact' })
    .order(parsed.sortBy, { ascending: parsed.sortDir === 'asc' })
    .range(parsed.from, parsed.to);

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.id);
  }

  if (parsed.search) {
    const orQuery = buildIlikeOr(
      ['user_id', 'draw_id', 'charity_id', 'payout_status', 'verification_status'],
      parsed.search
    );
    if (orQuery) {
      query = query.or(orQuery);
    }
  }

  if (req.query.payoutStatus) {
    query = query.eq('payout_status', String(req.query.payoutStatus).trim().toLowerCase());
  }

  if (req.query.status) {
    query = query.eq('verification_status', String(req.query.status).trim().toLowerCase());
  }

  const { data, error, count } = await query;

  if (error) {
    return sendError(res, 500, 'Failed to fetch winners', error.message);
  }

  return sendSuccess(res, 200, 'Winners fetched successfully', {
    items: (data || []).map(toApiWinner),
    meta: {
      ...paginationMeta(parsed, count),
      filters: {
        payoutStatus: String(req.query.payoutStatus || '').trim() || null,
        status: String(req.query.status || '').trim() || null,
      },
    },
  });
});

const createWinner = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const payload = normalizeCreateOrUpdatePayload(req.body);
  const { data, error } = await db.from('winners').insert([payload]).select(winnerSelect).single();

  if (error) {
    return sendError(res, 400, 'Failed to create winner', error.message);
  }

  await logAuditEvent(req, {
    action: 'create',
    entityType: 'winner',
    entityId: data?.id,
    details: { new: data },
  });

  return sendSuccess(res, 201, 'Winner created successfully', toApiWinner(data));
});

const getWinnerById = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db.from('winners').select(winnerSelect).eq('id', req.params.id).maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid winner id', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Winner not found');
  }

  return sendSuccess(res, 200, 'Winner fetched successfully', toApiWinner(data));
});

const updateWinner = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const payload = normalizeCreateOrUpdatePayload(req.body);

  const { data, error } = await db
    .from('winners')
    .update(payload)
    .eq('id', req.params.id)
    .select(winnerSelect)
    .maybeSingle();

  if (error) {
    return sendError(res, 400, 'Failed to update winner', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Winner not found');
  }

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'winner',
    entityId: data?.id,
    details: { patch: payload, updated: data },
  });

  return sendSuccess(res, 200, 'Winner updated successfully', toApiWinner(data));
});

const submitWinnerProof = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { proofFileUrl, proofNotes, proofFileDataBase64, proofFileName, proofMimeType } = req.body || {};

  const { data: existing, error: fetchError } = await db
    .from('winners')
    .select(winnerSelect)
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) {
    return sendError(res, 400, 'Failed to fetch winner', fetchError.message);
  }

  if (!existing) {
    return sendError(res, 404, 'Winner not found');
  }

  if (req.user.role !== 'admin' && req.user.id !== existing.user_id) {
    return sendError(res, 403, 'You can only submit proof for your own winner record');
  }

  let normalizedProofUrl = String(proofFileUrl || '').trim();

  if (proofFileDataBase64) {
    try {
      normalizedProofUrl = await uploadWinnerProofFile({
        winner: existing,
        proofFileDataBase64,
        proofFileName,
        proofMimeType,
      });
    } catch (error) {
      return sendError(res, 400, error.message || 'Failed to upload proof file');
    }
  }

  if (!normalizedProofUrl || !/^https?:\/\//i.test(normalizedProofUrl)) {
    return sendError(
      res,
      400,
      'Provide proofFileUrl (http/https) or a valid base64 proof file payload'
    );
  }

  const patch = {
    proof_file_url: normalizedProofUrl,
    proof_notes: proofNotes ? String(proofNotes).trim() : null,
    proof_submitted_by: req.user.id,
    proof_submitted_at: new Date().toISOString(),
    verification_status: 'submitted',
  };

  const { data, error } = await db
    .from('winners')
    .update(patch)
    .eq('id', req.params.id)
    .select(winnerSelect)
    .maybeSingle();

  if (error) {
    return sendError(res, 400, 'Failed to submit proof', error.message);
  }

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'winner',
    entityId: data?.id,
    details: { operation: 'proof_submit', patch },
  });

  return sendSuccess(res, 200, 'Winner proof submitted successfully', toApiWinner(data));
});

const verifyWinner = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { decision, notes } = req.body || {};
  const normalizedDecision = String(decision || '').trim().toLowerCase();

  if (!['approved', 'rejected'].includes(normalizedDecision)) {
    return sendError(res, 400, 'decision must be approved or rejected');
  }

  const { data, error, patch } = await updateWinnerVerificationStatusWithFallback({
    db,
    winnerId: req.params.id,
    verifierId: req.user.id,
    decision: normalizedDecision,
    notes,
  });

  if (error) {
    return sendError(res, 400, 'Failed to verify winner', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Winner not found');
  }

  await createNotification(req, {
    userId: data.user_id,
    channel: 'email',
    eventType: 'winner.verification',
    subject: `Winner proof ${normalizedDecision}`,
    body:
      normalizedDecision === 'approved'
        ? 'Your winner proof was approved. Payout will be processed soon.'
        : 'Your winner proof was rejected. Please review notes and re-submit proof.',
    metadata: {
      winnerId: data.id,
      decision: normalizedDecision,
    },
  });

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'winner',
    entityId: data?.id,
    details: { operation: 'verify', decision: normalizedDecision, notes: patch.proof_notes },
  });

  return sendSuccess(res, 200, `Winner ${normalizedDecision} successfully`, toApiWinner(data));
});

const markWinnerPaid = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { payoutReference, payoutProvider } = req.body || {};

  const { data, error, patch } = await updateWinnerPayoutStatusWithFallback({
    db,
    winnerId: req.params.id,
    markerId: req.user.id,
    payoutReference,
    payoutProvider,
  });

  if (error) {
    return sendError(res, 400, 'Failed to mark winner paid', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Winner not found');
  }

  const contribution = await recordCharityContribution({ db, winner: data });

  await createNotification(req, {
    userId: data.user_id,
    channel: 'email',
    eventType: 'winner.paid',
    subject: 'Winner payout completed',
    body: `Your payout has been marked paid. Reference: ${patch.payout_reference || 'N/A'}`,
    metadata: {
      winnerId: data.id,
      payoutReference: patch.payout_reference,
      charityContributionPercent: contribution.contributionPercent,
      charityAmountCents: contribution.charityAmountCents,
      playerAmountCents: contribution.playerAmountCents,
    },
  });

  await logAuditEvent(req, {
    action: 'update',
    entityType: 'winner',
    entityId: data?.id,
    details: { operation: 'mark_paid', patch },
  });

  return sendSuccess(res, 200, 'Winner marked as paid', {
    ...toApiWinner(data),
    contribution: {
      percent: contribution.contributionPercent,
      charityAmount: Number(contribution.charityAmountCents || 0) / 100,
      playerAmount: Number(contribution.playerAmountCents || 0) / 100,
    },
  });
});

const deleteWinner = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const { data, error } = await db.from('winners').delete().eq('id', req.params.id).select('id').maybeSingle();

  if (error) {
    return sendError(res, 400, 'Invalid winner id', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Winner not found');
  }

  await logAuditEvent(req, {
    action: 'delete',
    entityType: 'winner',
    entityId: data?.id || req.params.id,
    details: { deletedId: data?.id || req.params.id },
  });

  return sendSuccess(res, 200, 'Winner deleted');
});

module.exports = {
  listWinners,
  createWinner,
  getWinnerById,
  updateWinner,
  deleteWinner,
  submitWinnerProof,
  verifyWinner,
  markWinnerPaid,
};
