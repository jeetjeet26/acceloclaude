'use strict';

const { z } = require('zod');
const { AcceloClient } = require('../services/accelo-client');
const { listAcceloCollection } = require('../services/accelo-pagination');
const {
  attachAcceloCustomFields,
  normalizeAcceloList,
  resolveAcceloFields,
  withAcceloAliases,
} = require('../services/accelo-response');

const idParam = z.union([z.string(), z.number()]).transform(String);

function registerSalesTools(server, client) {
  // List prospects/sales
  server.tool(
    'list_prospects',
    'List sales prospects/opportunities in Accelo.',
    {
      search: z.string().optional().describe('Search by prospect title'),
      company_id: idParam.optional().describe('Filter by company'),
      status: z.enum(['active', 'inactive', 'won', 'lost', 'all']).optional().default('active'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ search, company_id, status, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };
        if (search) params['_search'] = search;

        const filters = [];
        if (company_id) filters.push(`company(${company_id})`);
        if (status && status !== 'all') filters.push(`standing(${status})`);
        const filterStr = AcceloClient.buildFilters(filters);
        if (filterStr) params['_filters'] = filterStr;

        const result = await listAcceloCollection(client, {
          path: '/prospects',
          params,
          fetchAll: fetch_all,
        });
        const prospects = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              prospects: prospects.map(p => ({
                ...withAcceloAliases(p, {
                  contact_id: 'contact',
                  manager_id: 'manager',
                  affiliation_id: 'affiliation',
                  status_id: 'status',
                  type_id: ['prospect_type', 'type'],
                }),
                status: p.standing,
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
          content: [{ type: 'text', text: `list_prospects failed: ${err.message}` }],
        };
      }
    }
  );
  server.tool(
    'get_prospect',
    'Get full details for a specific Accelo prospect by ID, including profile and extension values by default.',
    {
      prospect_id: idParam.describe('The Accelo prospect ID'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
      include_profile_values: z.boolean().optional().default(true).describe('Include prospect profile/custom field values'),
      include_extension_values: z.boolean().optional().default(true).describe('Include prospect extension field values'),
    },
    async ({ prospect_id, fields, include_profile_values, include_extension_values }) => {
      try {
        const { data } = await client.get(`/prospects/${prospect_id}`, {
          '_fields': resolveAcceloFields(fields),
        });
        const prospect = await attachAcceloCustomFields(client, {
          entity: 'prospects',
          objectId: prospect_id,
          record: {
            ...withAcceloAliases(data, {
              contact_id: 'contact',
              manager_id: 'manager',
              affiliation_id: 'affiliation',
              status_id: 'status',
              type_id: ['prospect_type', 'type'],
            }),
            status: data?.standing,
          },
          includeProfileValues: include_profile_values,
          includeExtensionValues: include_extension_values,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(prospect, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `get_prospect failed: ${err.message}` }],
        };
      }
    }
  );
}

function registerStaffTools(server, client) {
  // List staff members
  server.tool(
    'list_staff',
    'List staff members in the Accelo deployment.',
    {
      search: z.string().optional().describe('Search by name'),
      limit: z.number().int().min(1).max(100).optional().default(50),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ search, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };
        if (search) params['_search'] = search;

        const result = await listAcceloCollection(client, {
          path: '/staff',
          params,
          fetchAll: fetch_all,
        });
        const staff = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              staff: staff.map(s => ({
                ...withAcceloAliases(s, {
                  status_id: 'status',
                }),
                name: `${s.firstname || ''} ${s.surname || ''}`.trim(),
                status: s.standing,
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
          content: [{ type: 'text', text: `list_staff failed: ${err.message}` }],
        };
      }
    }
  );

  // Get invoices
  server.tool(
    'list_invoices',
    'List invoices in Accelo. Supports filtering by affiliation, date range, and search. Note: the Accelo API does not support filtering invoices directly by company_id or standing.',
    {
      affiliation_id: idParam.optional().describe('Filter by affiliation ID (links invoices to a company/contact)'),
      search: z.string().optional().describe('Search invoices by subject'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ affiliation_id, search, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };
        if (search) params['_search'] = search;

        const filters = [];
        if (affiliation_id) filters.push(`affiliation(${affiliation_id})`);
        const filterStr = AcceloClient.buildFilters(filters);
        if (filterStr) params['_filters'] = filterStr;

        const result = await listAcceloCollection(client, {
          path: '/invoices',
          params,
          fetchAll: fetch_all,
        });
        const invoices = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              invoices: invoices.map(i => ({
                ...withAcceloAliases(i, {
                  affiliation_id: 'affiliation',
                  contact_id: 'contact',
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
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `list_invoices failed: ${err.message}` }],
        };
      }
    }
  );
}

module.exports = { registerSalesTools, registerStaffTools };
