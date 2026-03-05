'use strict';

const { z } = require('zod');

function registerActivityTools(server, client) {
  // List activities (emails, calls, notes, timesheets)
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
        '_fields': 'subject,body,date_created,date_modified,owner_id,against_type,against_id,medium,thread_id',
      };
      if (against_type) params['against_type'] = against_type;
      if (against_id) params['against_id'] = against_id;
      if (activity_type && activity_type !== 'all') params['medium'] = activity_type;
      if (date_after) params['date_created_after'] = Math.floor(new Date(date_after).getTime() / 1000);
      if (date_before) params['date_created_before'] = Math.floor(new Date(date_before).getTime() / 1000);

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
              date_created: a.date_created,
              body_preview: a.body ? a.body.substring(0, 200) + (a.body.length > 200 ? '...' : '') : null,
            })),
            total: meta.more_info?.total_count || activities.length,
          }, null, 2),
        }],
      };
    }
  );

  // List timesheets / time entries
  server.tool(
    'list_time_entries',
    'List time entries/timesheets logged in Accelo, optionally filtered by staff, project, or date range.',
    {
      staff_id: z.string().optional().describe('Filter by staff member ID'),
      against_type: z.enum(['job', 'issue', 'task', 'milestone']).optional().describe('Filter by what the time was logged against'),
      against_id: z.string().optional().describe('ID of the project/task (requires against_type)'),
      date_after: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
      date_before: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ staff_id, against_type, against_id, date_after, date_before, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'date_logged,quantity,against_type,against_id,staff_id,nonbillable,rate_charged,activity_id',
      };
      if (staff_id) params['staff_id'] = staff_id;
      if (against_type) params['against_type'] = against_type;
      if (against_id) params['against_id'] = against_id;
      if (date_after) params['date_logged_after'] = Math.floor(new Date(date_after).getTime() / 1000);
      if (date_before) params['date_logged_before'] = Math.floor(new Date(date_before).getTime() / 1000);

      const { data, meta } = await client.get('/timers/time-entries', params);
      const entries = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            time_entries: entries.map(e => ({
              id: e.id,
              date: e.date_logged,
              hours: (e.quantity / 3600).toFixed(2),
              against_type: e.against_type,
              against_id: e.against_id,
              staff_id: e.staff_id,
              billable: !e.nonbillable,
              rate: e.rate_charged,
            })),
            total: meta.more_info?.total_count || entries.length,
          }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerActivityTools };
