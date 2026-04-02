'use strict';

const { z } = require('zod');
const { AcceloClient } = require('../services/accelo-client');
const { listAcceloCollection } = require('../services/accelo-pagination');
const {
  normalizeAcceloList,
  resolveAcceloFields,
  withAcceloAliases,
} = require('../services/accelo-response');

const idParam = z.union([z.string(), z.number()]).transform(String);

function registerRequestTools(server, client) {
  // List requests (support tickets / service requests)
  server.tool(
    'list_requests',
    'List service requests / support tickets in Accelo. Note: requests link to companies via affiliations, not directly by company_id. Use affiliation_id to filter by sender.',
    {
      search: z.string().optional().describe('Search by title or description'),
      affiliation_id: idParam.optional().describe('Filter by affiliation ID (links to a company/contact)'),
      status: z.enum(['open', 'pending', 'closed', 'all']).optional().default('open'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ search, affiliation_id, status, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };
        if (search) params['_search'] = search;

        const filters = [];
        if (affiliation_id) filters.push(`affiliation(${affiliation_id})`);
        if (status && status !== 'all') filters.push(`standing(${status})`);
        const filterStr = AcceloClient.buildFilters(filters);
        if (filterStr) params['_filters'] = filterStr;

        const result = await listAcceloCollection(client, {
          path: '/requests',
          params,
          fetchAll: fetch_all,
        });
        const requests = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              requests: requests.map(r => ({
                ...withAcceloAliases(r, {
                  affiliation_id: 'affiliation',
                  type_id: 'type',
                  claimer_id: 'claimer',
                  priority_id: ['request_priority', 'priority'],
                }),
                status: r.standing,
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
          content: [{ type: 'text', text: `list_requests failed: ${err.message}` }],
        };
      }
    }
  );

  // Get single request
  server.tool(
    'get_request',
    'Get full details for a specific Accelo request/ticket by ID.',
    {
      request_id: idParam.describe('The Accelo request ID'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ request_id, fields }) => {
      try {
        const { data } = await client.get(`/requests/${request_id}`, {
          '_fields': resolveAcceloFields(fields),
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ...withAcceloAliases(data, {
                affiliation_id: 'affiliation',
                type_id: 'type',
                claimer_id: 'claimer',
                priority_id: ['request_priority', 'priority'],
              }),
              status: data?.standing,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `get_request failed: ${err.message}` }],
        };
      }
    }
  );
}

module.exports = { registerRequestTools };
