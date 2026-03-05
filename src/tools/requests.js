'use strict';

const { z } = require('zod');

function registerRequestTools(server, client) {
  // List requests (support tickets / service requests)
  server.tool(
    'list_requests',
    'List service requests / support tickets in Accelo.',
    {
      search: z.string().optional().describe('Search by title or description'),
      company_id: z.string().optional().describe('Filter by company'),
      status: z.enum(['open', 'pending', 'closed', 'all']).optional().default('open'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ search, company_id, status, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'title,standing,type_id,company_id,contact_id,date_created,date_modified,affiliation_id',
      };
      if (search) params['_search'] = search;
      if (company_id) params['company_id'] = company_id;
      if (status && status !== 'all') params['standing'] = status;

      const { data, meta } = await client.get('/requests', params);
      const requests = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            requests: requests.map(r => ({
              id: r.id,
              title: r.title,
              status: r.standing,
              company_id: r.company_id,
              contact_id: r.contact_id,
              date_created: r.date_created,
              date_modified: r.date_modified,
            })),
            total: meta.more_info?.total_count || requests.length,
          }, null, 2),
        }],
      };
    }
  );

  // Get single request
  server.tool(
    'get_request',
    'Get full details for a specific Accelo request/ticket by ID.',
    {
      request_id: z.string().describe('The Accelo request ID'),
    },
    async ({ request_id }) => {
      const { data } = await client.get(`/requests/${request_id}`, {
        '_fields': 'title,standing,body,type_id,company_id,contact_id,date_created,date_modified,source,lead_id',
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerRequestTools };
