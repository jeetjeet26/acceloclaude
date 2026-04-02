const test = require('node:test');
const assert = require('node:assert/strict');

const { listAcceloCollection } = require('../src/services/accelo-pagination');

test('returns unknown totals when the count endpoint fails', async () => {
  const calls = [];
  const client = {
    async get(path, params) {
      calls.push({ path, params });

      if (path === '/companies/count') {
        throw new Error('count unavailable');
      }

      if (path === '/companies') {
        return { data: [{ id: 1 }, { id: 2 }, { id: 3 }] };
      }

      throw new Error(`Unexpected path: ${path}`);
    },
  };

  const result = await listAcceloCollection(client, {
    path: '/companies',
    params: { _limit: 3, _page: 0 },
    fetchAll: false,
  });

  assert.equal(result.total, null);
  assert.equal(result.total_pages, null);
  assert.equal(result.returned, 3);
  assert.equal(result.has_more, true);
  assert.equal(result.next_page, 1);
  assert.match(result.count_warning, /count unavailable/);
  assert.deepEqual(calls.map((call) => call.path), ['/companies/count', '/companies']);
});

test('fetch_all skips count requests and accumulates all pages', async () => {
  const calls = [];
  const client = {
    async get(path, params) {
      calls.push({ path, params });

      if (path !== '/companies') {
        throw new Error(`Unexpected path: ${path}`);
      }

      if (params._page === 0) {
        return { data: [{ id: 1 }, { id: 2 }] };
      }

      if (params._page === 1) {
        return { data: [{ id: 3 }] };
      }

      return { data: [] };
    },
  };

  const result = await listAcceloCollection(client, {
    path: '/companies',
    params: { _limit: 2, _page: 0 },
    fetchAll: true,
    fetchAllPageSize: 2,
  });

  assert.equal(result.fetch_all, true);
  assert.equal(result.total, 3);
  assert.equal(result.returned, 3);
  assert.equal(result.total_pages, 2);
  assert.equal(result.pages_fetched, 2);
  assert.deepEqual(result.items, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(calls.map((call) => call.path), ['/companies', '/companies']);
});
