const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseListQuery = (req, options = {}) => {
  const {
    defaultSortBy = 'created_at',
    allowedSortBy = ['created_at'],
    maxPageSize = 100,
    defaultPageSize = 20,
    defaultSortDir = 'desc',
  } = options;

  const page = toPositiveInt(req.query.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query.pageSize, defaultPageSize), maxPageSize);

  const search = String(req.query.search || '').trim();

  const sortByCandidate = String(req.query.sortBy || defaultSortBy).trim();
  const sortBy = allowedSortBy.includes(sortByCandidate) ? sortByCandidate : defaultSortBy;

  const dir = String(req.query.sortDir || defaultSortDir).toLowerCase();
  const sortDir = dir === 'asc' ? 'asc' : 'desc';

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return {
    page,
    pageSize,
    from,
    to,
    search,
    sortBy,
    sortDir,
  };
};

const paginationMeta = (parsed, total) => {
  const safeTotal = Number.isFinite(total) ? Number(total) : 0;

  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    total: safeTotal,
    totalPages: Math.max(Math.ceil(safeTotal / parsed.pageSize), 1),
    search: parsed.search,
    sortBy: parsed.sortBy,
    sortDir: parsed.sortDir,
  };
};

const buildIlikeOr = (columns, term) => {
  const safeTerm = String(term || '').replace(/,/g, ' ').trim();
  if (!safeTerm) {
    return '';
  }
  return columns.map((column) => `${column}.ilike.%${safeTerm}%`).join(',');
};

module.exports = {
  parseListQuery,
  paginationMeta,
  buildIlikeOr,
};
