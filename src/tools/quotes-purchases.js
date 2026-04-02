'use strict';

const { z } = require('zod');
const { listAcceloCollection } = require('../services/accelo-pagination');
const {
  normalizeAcceloList,
  resolveAcceloFields,
  withAcceloAliases,
} = require('../services/accelo-response');

const idParam = z.union([z.string(), z.number()]).transform(String);

function buildFilters(opts) {
  const parts = [];
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined && v !== null) parts.push(`${k}(${v})`);
  }
  return parts.length ? parts.join(',') : undefined;
}

function registerQuoteTools(server, client) {
  server.tool(
    'list_quotes',
    'List quotes/proposals in Accelo. Quotes link prospects to priced work and are essential for financial planning.',
    {
      against_type: z.enum(['prospect', 'job', 'issue']).optional().describe('Filter by object type the quote is against'),
      against_id: idParam.optional().describe('ID of the object (requires against_type)'),
      standing: z.enum(['draft', 'sent', 'accepted', 'declined', 'all']).optional().default('all'),
      manager_id: idParam.optional().describe('Filter by managing staff member ID'),
      search: z.string().optional().describe('Search by quote title'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ against_type, against_id, standing, manager_id, search, limit, page, fetch_all, fields }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': resolveAcceloFields(fields),
      };
      if (search) params['_search'] = search;
      const filters = buildFilters({
        ...(against_type ? { against_type } : {}),
        ...(against_id ? { against_id } : {}),
        ...(standing && standing !== 'all' ? { standing } : {}),
        ...(manager_id ? { manager: manager_id } : {}),
      });
      if (filters) params['_filters'] = filters;

      const result = await listAcceloCollection(client, {
        path: '/quotes',
        params,
        fetchAll: fetch_all,
      });
      const quotes = result.items;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            quotes: quotes.map(q => ({
              ...withAcceloAliases(q, {
                affiliation_id: 'affiliation',
                manager_id: 'manager',
              }),
              service_hours: q.service_time_total ? (Number(q.service_time_total) / 3600).toFixed(2) : null,
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
    }
  );

  server.tool(
    'get_quote',
    'Get full details for a specific Accelo quote/proposal by ID, including introduction, conclusion, and terms.',
    {
      quote_id: idParam.describe('The Accelo quote ID'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ quote_id, fields }) => {
      const { data } = await client.get(`/quotes/${quote_id}`, {
        '_fields': resolveAcceloFields(fields),
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(withAcceloAliases(data, {
            affiliation_id: 'affiliation',
            manager_id: 'manager',
          }), null, 2),
        }],
      };
    }
  );
}

function registerPurchaseTools(server, client) {
  server.tool(
    'list_purchases',
    'List purchases (vendor costs / procurement) in Accelo. Tracks expenses made when completing jobs, issues, or contracts.',
    {
      owner_id: idParam.optional().describe('Filter by staff owner ID'),
      affiliation_id: idParam.optional().describe('Filter by affiliation/vendor'),
      search: z.string().optional().describe('Search by purchase title'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ owner_id, affiliation_id, search, limit, page, fetch_all, fields }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': resolveAcceloFields(fields),
      };
      if (search) params['_search'] = search;
      const filters = buildFilters({
        ...(owner_id ? { owner_id } : {}),
        ...(affiliation_id ? { affiliation_id } : {}),
      });
      if (filters) params['_filters'] = filters;

      const result = await listAcceloCollection(client, {
        path: '/purchases',
        params,
        fetchAll: fetch_all,
      });
      const purchases = result.items;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            purchases: purchases.map(p => ({
              ...withAcceloAliases(p, {
                owner_id: 'owner',
                affiliation_id: 'affiliation',
              }),
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
    }
  );
}

module.exports = { registerQuoteTools, registerPurchaseTools };
