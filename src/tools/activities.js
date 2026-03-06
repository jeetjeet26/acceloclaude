'use strict';

const { z } = require('zod');

function buildAcceloFilters(opts) {
  const parts = [];
  if (opts.against_type) parts.push(`against_type(${opts.against_type})`);
  if (opts.against_id) parts.push(`against_id(${opts.against_id})`);
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
      against_id: z.string().optional().describe('The ID of the object (requires against_type)'),
      activity_type: z.enum(['email', 'call', 'note', 'meeting', 'postal_mail', 'fax', 'all']).optional().default('all'),
      date_after: z.string().optional().describe('Filter activities after this date (YYYY-MM-DD)'),
      date_before: z.string().optional().describe('Filter activities before this date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ against_type, against_id, activity_type, date_after, date_before, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'subject,body,date_created,date_modified,date_logged,owner_id,against_type,against_id,medium,thread_id,billable,nonbillable,staff,rate_charged',
      };
      const filters = buildAcceloFilters({
        against_type,
        against_id,
        medium: activity_type && activity_type !== 'all' ? activity_type : undefined,
        date_created_after: date_after ? Math.floor(new Date(date_after).getTime() / 1000) : undefined,
        date_created_before: date_before ? Math.floor(new Date(date_before).getTime() / 1000) : undefined,
      });
      if (filters) params['_filters'] = filters;

      const { data, meta } = await client.get('/activities', params);
      const activities = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            activities: activities.map(a => ({
              id: a.id,
              subject: a.subject,
              type: a.medium,
              against_type: a.against_type,
              against_id: a.against_id,
              owner_id: a.owner_id,
              staff_id: typeof a.staff === 'object' ? a.staff?.id : a.staff,
              date_created: a.date_created,
              date_logged: a.date_logged,
              billable_hours: Number(a.billable) ? (Number(a.billable) / 3600).toFixed(2) : null,
              nonbillable_hours: Number(a.nonbillable) ? (Number(a.nonbillable) / 3600).toFixed(2) : null,
              rate_charged: a.rate_charged,
              body_preview: a.body ? a.body.substring(0, 200) + (a.body.length > 200 ? '...' : '') : null,
            })),
            total: meta.more_info?.total_count || activities.length,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'list_time_entries',
    'List activities with time logged in Accelo, ordered by most billable time first. Returns billable/nonbillable hours per activity.',
    {
      staff_id: z.string().optional().describe('Filter by staff member ID who logged time'),
      against_type: z.enum(['company', 'contact', 'prospect', 'job', 'issue', 'request', 'task']).optional()
        .describe('Filter by what the time was logged against'),
      against_id: z.string().optional().describe('ID of the object (requires against_type)'),
      date_after: z.string().optional().describe('Only entries logged after this date (YYYY-MM-DD)'),
      date_before: z.string().optional().describe('Only entries logged before this date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(100).optional().default(50),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ staff_id, against_type, against_id, date_after, date_before, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'subject,medium,date_logged,billable,nonbillable,rate_charged,against_type,against_id,staff,task,standing',
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

      const { data, meta } = await client.get('/activities', params);
      const activities = Array.isArray(data) ? data : (data ? [data] : []);

      const withTime = activities.filter(a => Number(a.billable) > 0 || Number(a.nonbillable) > 0);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            time_entries: withTime.map(a => ({
              id: a.id,
              subject: a.subject,
              medium: a.medium,
              date_logged: a.date_logged,
              billable_hours: (Number(a.billable) / 3600).toFixed(2),
              nonbillable_hours: (Number(a.nonbillable) / 3600).toFixed(2),
              total_hours: ((Number(a.billable) + Number(a.nonbillable)) / 3600).toFixed(2),
              rate_charged: a.rate_charged,
              against_type: a.against_type,
              against_id: a.against_id,
              staff_id: typeof a.staff === 'object' ? a.staff?.id : a.staff,
              task_id: typeof a.task === 'object' ? a.task?.id : a.task,
              standing: a.standing,
            })),
            summary: {
              activities_with_time: withTime.length,
              total_activities_returned: activities.length,
              total_billable_hours: (withTime.reduce((s, a) => s + Number(a.billable), 0) / 3600).toFixed(2),
              total_nonbillable_hours: (withTime.reduce((s, a) => s + Number(a.nonbillable), 0) / 3600).toFixed(2),
            },
            total: meta.more_info?.total_count || activities.length,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_time_allocations',
    'Get total billable/nonbillable hours and amount charged across activities. Useful for time reports by project, staff, or date range.',
    {
      staff_id: z.string().optional().describe('Filter by staff member ID'),
      against_type: z.enum(['company', 'contact', 'prospect', 'job', 'issue', 'request', 'task']).optional()
        .describe('Filter by object type'),
      against_id: z.string().optional().describe('ID of the object (requires against_type)'),
      date_after: z.string().optional().describe('Only time logged after this date (YYYY-MM-DD)'),
      date_before: z.string().optional().describe('Only time logged before this date (YYYY-MM-DD)'),
    },
    async ({ staff_id, against_type, against_id, date_after, date_before }) => {
      const params = {};
      const filters = buildAcceloFilters({
        against_type,
        against_id,
        staff_id,
        date_logged_after: date_after ? Math.floor(new Date(date_after).getTime() / 1000) : undefined,
        date_logged_before: date_before ? Math.floor(new Date(date_before).getTime() / 1000) : undefined,
      });
      if (filters) params['_filters'] = filters;

      const { data } = await client.get('/activities/allocations', params);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            billable_hours: (Number(data.billable || 0) / 3600).toFixed(2),
            nonbillable_hours: (Number(data.unbillable || data.nonbillable || 0) / 3600).toFixed(2),
            total_hours: ((Number(data.billable || 0) + Number(data.unbillable || data.nonbillable || 0)) / 3600).toFixed(2),
            total_charged: data.charged || '0.00',
          }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerActivityTools };
