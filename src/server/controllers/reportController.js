const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getDbClient } = require('../utils/supabaseRequest');

const toMonth = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 7);
};

const pickFirstNumber = (row, keys) => {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
};

const pickFirstString = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
};

const toCsv = (rows) => {
  if (!rows.length) {
    return 'month,scores,winners,contacts,total_prize\n';
  }

  const header = 'month,scores,winners,contacts,total_prize';
  const body = rows.map((row) => {
    return [row.month, row.scores, row.winners, row.contacts, row.total_prize.toFixed(2)].join(',');
  });

  return [header, ...body].join('\n');
};

const buildMonthly = ({ scores, winners, contacts }) => {
  const map = new Map();

  const ensure = (month) => {
    if (!map.has(month)) {
      map.set(month, {
        month,
        scores: 0,
        winners: 0,
        contacts: 0,
        total_prize: 0,
      });
    }
    return map.get(month);
  };

  for (const score of scores) {
    const month = toMonth(score.score_date);
    if (!month) {
      continue;
    }
    const bucket = ensure(month);
    bucket.scores += 1;
  }

  for (const winner of winners) {
    const month = toMonth(winner.created_at || winner.updated_at || winner.draw_month);
    if (!month) {
      continue;
    }
    const bucket = ensure(month);
    bucket.winners += 1;
    bucket.total_prize += pickFirstNumber(winner, ['prize_amount', 'amount', 'prize', 'prize_value']) ||
      pickFirstNumber(winner, ['payout_amount_cents']) / 100;
  }

  for (const contact of contacts) {
    const month = toMonth(contact.submitted_at || contact.created_at);
    if (!month) {
      continue;
    }
    const bucket = ensure(month);
    bucket.contacts += 1;
  }

  return Array.from(map.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
};

const isMissingSchemaResource = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find') || message.includes('relation');
};

const loadReportData = async (db) => {
  const [scoresRes, drawsRes, charitiesRes, winnersRes, contactsRes] = await Promise.all([
    db.from('scores').select('id, score_date', { count: 'exact' }),
    db.from('draws').select('id', { count: 'exact', head: true }),
    db.from('charities').select('id', { count: 'exact', head: true }),
    db.from('winners').select('*', { count: 'exact' }),
    db.from('contact_messages').select('id, created_at', { count: 'exact' }),
  ]);

  const tolerantContactsRes =
    contactsRes.error && isMissingSchemaResource(contactsRes.error)
      ? { data: [], count: 0, error: null }
      : contactsRes;

  const firstError = [scoresRes, drawsRes, charitiesRes, winnersRes, tolerantContactsRes].find((entry) => entry.error);

  if (firstError?.error) {
    return {
      error: firstError.error,
    };
  }

  const scores = scoresRes.data || [];
  const draws = drawsRes.data || [];
  const charities = charitiesRes.data || [];
  const winners = winnersRes.data || [];
  const contacts = tolerantContactsRes.data || [];

  const totalPrize = winners.reduce(
    (sum, row) =>
      sum +
      (pickFirstNumber(row, ['prize_amount', 'amount', 'prize', 'prize_value']) ||
        pickFirstNumber(row, ['payout_amount_cents']) / 100),
    0
  );
  const paidWinners = winners.filter((row) => pickFirstString(row, ['payout_status', 'status']) === 'paid').length;

  return {
    data: {
      totals: {
        scores: scoresRes.count || 0,
        draws: drawsRes.count || 0,
        charities: charitiesRes.count || 0,
        winners: winnersRes.count || 0,
        contacts: tolerantContactsRes.count || 0,
        paidWinners,
        pendingWinners: Math.max((winnersRes.count || 0) - paidWinners, 0),
        totalPrize,
      },
      monthly: buildMonthly({ scores, winners, contacts }),
    },
  };
};

const getReportSummary = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const report = await loadReportData(db);

  if (report.error) {
    return sendError(res, 500, 'Failed to build reports', report.error.message);
  }

  return sendSuccess(res, 200, 'Reports fetched successfully', report.data);
});

const exportReportCsv = asyncHandler(async (req, res) => {
  const db = getDbClient(req);
  const report = await loadReportData(db);

  if (report.error) {
    return sendError(res, 500, 'Failed to export reports', report.error.message);
  }

  const csv = toCsv(report.data.monthly);
  const fileName = `digital-heroes-report-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.status(200).send(csv);
});

module.exports = {
  getReportSummary,
  exportReportCsv,
};
