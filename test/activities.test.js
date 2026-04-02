const test = require('node:test');
const assert = require('node:assert/strict');

const { registerActivityTools } = require('../src/tools/activities');

function getToolHandler(toolName, client) {
  const handlers = new Map();
  const server = {
    tool(name, _description, _schema, handler) {
      handlers.set(name, handler);
    },
  };

  registerActivityTools(server, client);
  return handlers.get(toolName);
}

test('get_time_allocations uses the native allocations endpoint', async () => {
  const calls = [];
  const handler = getToolHandler('get_time_allocations', {
    async get(path, params) {
      calls.push({ path, params });
      return {
        data: {
          billable: '7200',
          nonbillable: '1800',
          charged: '350.50',
        },
      };
    },
  });

  const result = await handler({
    staff_id: '5',
    against_type: 'job',
    against_id: '123',
    date_after: '2026-01-01',
    date_before: '2026-01-31',
  });

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/activities/allocations');
  assert.match(calls[0].params._filters, /against\(job\(123\)\)/);
  assert.match(calls[0].params._filters, /staff\(5\)/);
  assert.match(calls[0].params._filters, /date_logged_after\(/);
  assert.match(calls[0].params._filters, /date_logged_before\(/);

  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.billable_hours, '2.00');
  assert.equal(payload.nonbillable_hours, '0.50');
  assert.equal(payload.total_hours, '2.50');
  assert.equal(payload.total_charged, '350.50');
  assert.equal(payload.activities_scanned, null);
  assert.equal(payload.total_matching_activities, null);
});

test('get_time_allocations accepts Accelo unbillable responses', async () => {
  const handler = getToolHandler('get_time_allocations', {
    async get() {
      return {
        data: {
          billable: '3600',
          unbillable: '1800',
          charged: '100.00',
        },
      };
    },
  });

  const result = await handler({});
  const payload = JSON.parse(result.content[0].text);

  assert.equal(payload.billable_hours, '1.00');
  assert.equal(payload.nonbillable_hours, '0.50');
  assert.equal(payload.total_hours, '1.50');
  assert.equal(payload.total_charged, '100.00');
});
