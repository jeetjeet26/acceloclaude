'use strict';

const { z } = require('zod');

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
    },
    async ({ against_type, against_id, standing, manager_id, search, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'title,standing,against_type,against_id,affiliation_id,manager_id,created_by_staff_id,date_created,date_expiry,service_price_total,service_time_total,material_price_total,total_price',
      };
      if (search) params['_search'] = search;
      const filters = buildFilters({
        ...(against_type ? { against_type } : {}),
        ...(against_id ? { against_id } : {}),
        ...(standing && standing !== 'all' ? { standing } : {}),
        ...(manager_id ? { manager: manager_id } : {}),
      });
      if (filters) params['_filters'] = filters;

      const { data, meta } = await client.get('/quotes', params);
      const quotes = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            quotes: quotes.map(q => ({
              id: q.id,
              title: q.title,
              standing: q.standing,
              against_type: q.against_type,
              against_id: q.against_id,
              affiliation_id: q.affiliation_id,
              manager_id: q.manager_id,
              created_by: q.created_by_staff_id,
              date_created: q.date_created,
              date_expiry: q.date_expiry,
              service_price: q.service_price_total,
              service_hours: q.service_time_total ? (Number(q.service_time_total) / 3600).toFixed(2) : null,
              material_price: q.material_price_total,
              total_price: q.total_price,
            })),
            total: meta.more_info?.total_count || quotes.length,
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
    },
    async ({ quote_id }) => {
      const { data } = await client.get(`/quotes/${quote_id}`, {
        '_fields': 'title,standing,against_type,against_id,affiliation_id,manager_id,created_by_staff_id,date_created,date_expiry,service_price_total,service_time_total,material_price_total,total_price,introduction,conclusion,terms,notes,portal_access',
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
    },
    async ({ owner_id, affiliation_id, search, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'title,owner_id,creator_id,affiliation_id,amount,tax,total,date_purchased',
      };
      if (search) params['_search'] = search;
      const filters = buildFilters({
        ...(owner_id ? { owner_id } : {}),
        ...(affiliation_id ? { affiliation_id } : {}),
      });
      if (filters) params['_filters'] = filters;

      const { data, meta } = await client.get('/purchases', params);
      const purchases = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            purchases: purchases.map(p => ({
              id: p.id,
              title: p.title,
              owner_id: p.owner_id,
              creator_id: p.creator_id,
              affiliation_id: p.affiliation_id,
              amount: p.amount,
              tax: p.tax,
              total: p.total,
              date_purchased: p.date_purchased,
            })),
            total: meta.more_info?.total_count || purchases.length,
          }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerQuoteTools, registerPurchaseTools };
