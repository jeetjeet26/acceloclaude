'use strict';

const { normalizeAcceloList } = require('./accelo-response');

const PAGINATION_KEYS = new Set(['_limit', '_page', '_offset']);

function toPositiveInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function buildCountParams(params = {}) {
  const countParams = {};

  for (const [key, value] of Object.entries(params)) {
    if (PAGINATION_KEYS.has(key) || key === '_fields') {
      continue;
    }

    if (value !== undefined && value !== null && value !== '') {
      countParams[key] = value;
    }
  }

  return countParams;
}

function parseAcceloCount(data) {
  if (data === null || data === undefined) {
    return null;
  }

  if (Array.isArray(data)) {
    return parseAcceloCount(data[0]);
  }

  if (typeof data === 'object' && data.count !== undefined) {
    const count = Number(data.count);
    return Number.isFinite(count) ? count : null;
  }

  const count = Number(data);
  return Number.isFinite(count) ? count : null;
}

async function getAcceloCount(client, path, params = {}, countPath = `${path}/count`) {
  const { data } = await client.get(countPath, buildCountParams(params));
  const count = parseAcceloCount(data);

  if (!Number.isFinite(count)) {
    throw new Error(`Accelo count endpoint did not return a numeric count for ${countPath}`);
  }

  return count;
}

async function listAcceloCollection(
  client,
  {
    path,
    params = {},
    countPath,
    fetchAll = false,
    fetchAllPageSize = 100,
  }
) {
  const requestedPage = toPositiveInt(params._page, 0);
  const requestedLimit = Math.min(Math.max(toPositiveInt(params._limit, 20), 1), 100);

  let total = null;
  let countWarning = null;

  if (!fetchAll) {
    try {
      total = await getAcceloCount(client, path, params, countPath);
    } catch (err) {
      countWarning = err.message;
    }
  }

  if (fetchAll) {
    const pageSize = Math.min(Math.max(toPositiveInt(fetchAllPageSize, 100), 1), 100);
    const items = [];
    let page = 0;

    while (true) {
      const { data } = await client.get(path, {
        ...params,
        '_page': page,
        '_limit': pageSize,
      });
      const pageItems = normalizeAcceloList(data);
      items.push(...pageItems);

      if (!pageItems.length || pageItems.length < pageSize) {
        break;
      }

      if (total !== null && items.length >= total) {
        break;
      }

      page += 1;

      if (page > 10_000) {
        throw new Error(`Exceeded pagination safety limit while fetching ${path}`);
      }
    }

    const resolvedTotal = items.length;

    return {
      items,
      total: resolvedTotal,
      returned: items.length,
      page: 0,
      page_size: pageSize,
      total_pages: pageSize ? Math.ceil(resolvedTotal / pageSize) : 1,
      pages_fetched: page + 1,
      has_more: false,
      next_page: null,
      fetch_all: true,
      ...(countWarning ? { count_warning: countWarning } : {}),
    };
  }

  const { data } = await client.get(path, params);
  const items = normalizeAcceloList(data);
  const hasMore = total !== null
    ? ((requestedPage + 1) * requestedLimit) < total
    : items.length === requestedLimit;

  return {
    items,
    total,
    returned: items.length,
    page: requestedPage,
    page_size: requestedLimit,
    total_pages: total !== null && requestedLimit ? Math.ceil(total / requestedLimit) : null,
    pages_fetched: 1,
    has_more: hasMore,
    next_page: hasMore ? requestedPage + 1 : null,
    fetch_all: false,
    ...(countWarning ? { count_warning: countWarning } : {}),
  };
}

module.exports = {
  buildCountParams,
  getAcceloCount,
  listAcceloCollection,
  parseAcceloCount,
};
