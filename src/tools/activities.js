'use strict';

const { z } = require('zod');
const { listAcceloCollection } = require('../services/accelo-pagination');
const {
  normalizeAcceloList,
  resolveAcceloFields,
  withAcceloAliases,
} = require('../services/accelo-response');

const idParam = z.union([z.string(), z.number()]).transform(String);

function buildAcceloFilters(opts) {
  const parts = [];
  if (opts.against_type && opts.against_id) {
    parts.push(`against(${opts.against_type}(${opts.against_id}))`);
  } else {
    if (opts.against_type) parts.push(`against_type(${opts.against_type})`);
    if (opts.against_id) parts.push(`against_id(${opts.against_id})`);
  }
  if (opts.staff_id) parts.push(`staff(${opts.staff_id})`);
  if (opts.medium) parts.push(`medium(${opts.medium})`);
  if (opts.owner_id) parts.push(`owner_id(${opts.owner_id})`);
  if (opts.date_created_after) parts.push(`date_created_after(${opts.date_created_after})`);
  if (opts.date_created_before) parts.push(`date_created_before(${opts.date_created_before})`);
  if (opts.date_logged_after) parts.push(`date_logged_after(${opts.date_logged_after})`);
  if (opts.date_logged_before) parts.push(`date_logged_before(${opts.date_logged_before})`);
  if (opts.order_by) parts.push(`order_by_desc(${opts.order_by})`);
  return parts.length ? parts.join(',') : undefined;
}

function registerActivityTools(server, client) {
  server.tool(
    'list_activities',
    'List activities (emails, calls, notes, time entries) in Accelo. Activities are associated with companies, contacts, projects, or requests.',
    {
      against_type: z.enum(['company', 'contact', 'prospect', 'job', 'issue', 'request', 'task']).optional()
        .describe('The type of object this activity is against'),
      against_id: idParam.optional().describe('The ID of the object (requires against_type)'),
      activity_type: z.enum(['email', 'call', 'note', 'meeting', 'postal_mail', 'fax', 'all']).optional().default('all'),
      date_after: z.string().optional().describe('Filter activities after this date (YYYY-MM-DD)'),
      date_before: z.string().optional().describe('Filter activities before this date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ against_type, against_id, activity_type, date_after, date_before, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };
        const filters = buildAcceloFilters({
          against_type,
          against_id,
          medium: activity_type && activity_type !== 'all' ? activity_type : undefined,
          date_created_after: date_after ? Math.floor(new Date(date_after).getTime() / 1000) : undefined,
          date_created_before: date_before ? Math.floor(new Date(date_before).getTime() / 1000) : undefined,
        });
        if (filters) params['_filters'] = filters;

        const result = await listAcceloCollection(client, {
          path: '/activities',
          params,
          fetchAll: fetch_all,
        });
        const activities = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              activities: activities.map(a => ({
                ...withAcceloAliases(a, {
                  owner_id: 'owner',
                  staff_id: 'staff',
                  thread_id: 'thread',
                  class_id: 'activity_class',
                  priority_id: ['activity_priority', 'priority'],
                }),
                type: a.medium,
                billable_hours: Number(a.billable) ? (Number(a.billable) / 3600).toFixed(2) : null,
                nonbillable_hours: Number(a.nonbillable) ? (Number(a.nonbillable) / 3600).toFixed(2) : null,
                body_preview: a.body ? a.body.substring(0, 200) + (a.body.length > 200 ? '...' : '') : null,
              })),
              total: result.total,
              returned: result.returned,
              page: result.page,
              page_size: result.page_size,
              total_pages: result.total_pages,
              has_more: result.has_more,
              next_page: result.next_page,
              fetch_all: result.fetch_all,
              ...(result.count_warning ? { count_warning: result.count_warning } : {}),
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `list_activities failed: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    'list_time_entries',
    'List activities with time logged in Accelo, ordered by most billable time first. Returns billable/nonbillable hours per activity.',
    {
      staff_id: idParam.optional().describe('Filter by staff member ID who logged time'),
      against_type: z.enum(['company', 'contact', 'prospect', 'job', 'issue', 'request', 'task']).optional()
        .describe('Filter by what the time was logged against'),
      against_id: idParam.optional().describe('ID of the object (requires against_type)'),
      date_after: z.string().optional().describe('Only entries logged after this date (YYYY-MM-DD)'),
      date_before: z.string().optional().describe('Only entries logged before this date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(100).optional().default(50),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ staff_id, against_type, against_id, date_after, date_before, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };
        const filters = buildAcceloFilters({
          against_type,
          against_id,
          staff_id,
          date_logged_after: date_after ? Math.floor(new Date(date_after).getTime() / 1000) : undefined,
          date_logged_before: date_before ? Math.floor(new Date(date_before).getTime() / 1000) : undefined,
          order_by: 'billable',
        });
        if (filters) params['_filters'] = filters;

        const result = await listAcceloCollection(client, {
          path: '/activities',
          params,
          fetchAll: fetch_all,
        });
        const activities = result.items;

        const withTime = activities.filter(a => Number(a.billable) > 0 || Number(a.nonbillable) > 0);
        const isComplete = result.fetch_all || !result.has_more;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              time_entries: withTime.map(a => ({
                ...withAcceloAliases(a, {
                  owner_id: 'owner',
                  staff_id: 'staff',
                  task_id: 'task',
                  thread_id: 'thread',
                }),
                billable_hours: (Number(a.billable) / 3600).toFixed(2),
                nonbillable_hours: (Number(a.nonbillable) / 3600).toFixed(2),
                total_hours: ((Number(a.billable) + Number(a.nonbillable)) / 3600).toFixed(2),
              })),
              summary: {
                activities_with_time: withTime.length,
                total_activities_returned: activities.length,
                total_billable_hours: (withTime.reduce((s, a) => s + Number(a.billable), 0) / 3600).toFixed(2),
                total_nonbillable_hours: (withTime.reduce((s, a) => s + Number(a.nonbillable), 0) / 3600).toFixed(2),
              },
              total: isComplete ? withTime.length : null,
              returned: withTime.length,
              activity_total_from_api: result.total,
              page: result.page,
              page_size: result.page_size,
              total_pages: result.total_pages,
              has_more: result.has_more,
              next_page: result.next_page,
              fetch_all: result.fetch_all,
              total_is_complete: isComplete,
              ...(result.count_warning ? { count_warning: result.count_warning } : {}),
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `list_time_entries failed: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    'get_time_allocations',
    'Get total billable/nonbillable hours and amount charged across activities. Useful for time reports by project, staff, or date range.',
    {
      staff_id: idParam.optional().describe('Filter by staff member ID'),
      against_type: z.enum(['company', 'contact', 'prospect', 'job', 'issue', 'request', 'task']).optional()
        .describe('Filter by object type'),
      against_id: idParam.optional().describe('ID of the object (requires against_type)'),
      date_after: z.string().optional().describe('Only time logged after this date (YYYY-MM-DD)'),
      date_before: z.string().optional().describe('Only time logged before this date (YYYY-MM-DD)'),
    },
    async ({ staff_id, against_type, against_id, date_after, date_before }) => {
      try {
        const filters = buildAcceloFilters({
          against_type,
          against_id,
          staff_id,
          date_logged_after: date_after ? Math.floor(new Date(date_after).getTime() / 1000) : undefined,
          date_logged_before: date_before ? Math.floor(new Date(date_before).getTime() / 1000) : undefined,
        });
        const params = filters ? { '_filters': filters } : {};
        const { data } = await client.get('/activities/allocations', params);
        const allocations = Array.isArray(data) ? (data[0] || {}) : (data || {});
        const billableSeconds = Number(allocations.billable || 0);
        const nonbillableSeconds = Number(allocations.nonbillable ?? allocations.unbillable ?? 0);
        const totalCharged = Number(allocations.charged || 0);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              billable_hours: (billableSeconds / 3600).toFixed(2),
              nonbillable_hours: (nonbillableSeconds / 3600).toFixed(2),
              total_hours: ((billableSeconds + nonbillableSeconds) / 3600).toFixed(2),
              total_charged: totalCharged.toFixed(2),
              activities_scanned: null,
              total_matching_activities: null,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `get_time_allocations failed: ${err.message}` }],
        };
      }
    }
  );
}

module.exports = { registerActivityTools };
