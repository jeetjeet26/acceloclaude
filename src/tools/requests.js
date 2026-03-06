'use strict';

const { z } = require('zod');
const { AcceloClient } = require('../services/accelo-client');

function registerRequestTools(server, client) {
  // List requests (support tickets / service requests)
  server.tool(
    'list_requests',
    'List service requests / support tickets in Accelo. Note: requests link to companies via affiliations, not directly by company_id. Use affiliation_id to filter by sender.',
    {
      search: z.string().optional().describe('Search by title or description'),
      affiliation_id: z.string().optional().describe('Filter by affiliation ID (links to a company/contact)'),
      status: z.enum(['open', 'pending', 'closed', 'all']).optional().default('open'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ search, affiliation_id, status, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'title,standing,type_id,affiliation_id,claimer_id,date_created,date_modified',
      };
      if (search) params['_search'] = search;

      const filters = [];
      if (affiliation_id) filters.push(`affiliation(${affiliation_id})`);
      if (status && status !== 'all') filters.push(`standing(${status})`);
      const filterStr = AcceloClient.buildFilters(filters);
      if (filterStr) params['_filters'] = filterStr;

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
              affiliation_id: r.affiliation_id,
              claimer_id: r.claimer_id,
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
