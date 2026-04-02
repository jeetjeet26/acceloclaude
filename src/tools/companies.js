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

function registerCompanyTools(server, client) {
  // List companies
  server.tool(
    'list_companies',
    'List client companies in Accelo. Supports search, filtering, and pagination.',
    {
      search: z.string().optional().describe('Search by company name'),
      status: z.enum(['active', 'inactive', 'all']).optional().default('active').describe('Filter by status'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Max results (1-100)'),
      page: z.number().int().min(0).optional().default(0).describe('Page offset'),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL". Supports linked syntax like "postal_address(),manager()".'),
    },
    async ({ search, status, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };
        if (search) params['_search'] = search;

        const filters = [];
        if (status && status !== 'all') filters.push(`standing(${status})`);
        const filterStr = AcceloClient.buildFilters(filters);
        if (filterStr) params['_filters'] = filterStr;

        const result = await listAcceloCollection(client, {
          path: '/companies',
          params,
          fetchAll: fetch_all,
        });
        const companies = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              companies: companies.map(c => ({
                ...withAcceloAliases(c, {
                  status_id: 'status',
                }),
                status: c.standing,
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
          content: [{ type: 'text', text: `list_companies failed: ${err.message}` }],
        };
      }
    }
  );

  // Get single company
  server.tool(
    'get_company',
    'Get full details for a specific Accelo company by ID, including profile values by default.',
    {
      company_id: idParam.describe('The Accelo company ID'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
      include_profile_values: z.boolean().optional().default(true).describe('Include company profile/custom field values'),
    },
    async ({ company_id, fields, include_profile_values }) => {
      try {
        const { data } = await client.get(`/companies/${company_id}`, {
          '_fields': resolveAcceloFields(fields),
        });
        const company = await attachAcceloCustomFields(client, {
          entity: 'companies',
          objectId: company_id,
          record: {
            ...withAcceloAliases(data, {
              status_id: 'status',
            }),
            status: data?.standing,
          },
          includeProfileValues: include_profile_values,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(company, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `get_company failed: ${err.message}` }],
        };
      }
    }
  );

  // List contacts
  server.tool(
    'list_contacts',
    'List contacts in Accelo. Can filter by company or search by name/email.',
    {
      search: z.string().optional().describe('Search by name or email'),
      company_id: idParam.optional().describe('Filter contacts by company ID'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Max results'),
      page: z.number().int().min(0).optional().default(0).describe('Page offset'),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ search, company_id, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };
        if (search) params['_search'] = search;

        const endpoint = company_id ? `/companies/${company_id}/contacts` : '/contacts';
        const result = await listAcceloCollection(client, {
          path: endpoint,
          params,
          fetchAll: fetch_all,
        });
        const contacts = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              contacts: contacts.map(c => ({
                ...withAcceloAliases(c, {
                  affiliation_id: 'default_affiliation',
                  status_id: 'contact_status',
                }),
                name: `${c.firstname || ''} ${c.surname || ''}`.trim(),
                status: c.standing,
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
          content: [{ type: 'text', text: `list_contacts failed: ${err.message}` }],
        };
      }
    }
  );
  server.tool(
    'get_contact',
    'Get full details for a specific Accelo contact by ID, including profile values by default.',
    {
      contact_id: idParam.describe('The Accelo contact ID'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
      include_profile_values: z.boolean().optional().default(true).describe('Include contact profile/custom field values'),
    },
    async ({ contact_id, fields, include_profile_values }) => {
      try {
        const { data } = await client.get(`/contacts/${contact_id}`, {
          '_fields': resolveAcceloFields(fields),
        });
        const contact = await attachAcceloCustomFields(client, {
          entity: 'contacts',
          objectId: contact_id,
          record: {
            ...withAcceloAliases(data, {
              affiliation_id: 'default_affiliation',
              status_id: 'contact_status',
            }),
            name: `${data?.firstname || ''} ${data?.surname || ''}`.trim(),
            status: data?.standing,
          },
          includeProfileValues: include_profile_values,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(contact, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `get_contact failed: ${err.message}` }],
        };
      }
    }
  );
  // Create a new company (POST only — no edit, no delete)
  server.tool(
    'create_company',
    'Create a new company in Accelo. Returns the created company.',
    {
      name: z.string().describe('Required — the company name'),
      website: z.string().optional().describe('Company website URL'),
      phone: z.string().optional().describe('Company phone number'),
      fax: z.string().optional().describe('Company fax number'),
      comments: z.string().optional().describe('Notes or comments about the company'),
      parent_id: idParam.optional().describe('ID of a parent company'),
      status_id: idParam.optional().describe('ID of the company status'),
      standing: z.enum(['active', 'inactive']).optional().describe('Company standing (overridden if status_id is also sent)'),
    },
    async (params) => {
      try {
        const body = {};
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) body[key] = value;
        }

        const { data } = await client.post('/companies', body, {
          '_fields': '_ALL',
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              created_company: {
                ...withAcceloAliases(data, {
                  status_id: 'status',
                }),
                status: data?.standing,
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `create_company failed: ${err.message}` }],
        };
      }
    }
  );
  // Add a manager to a company (POST only)
  server.tool(
    'add_company_manager',
    'Assign a staff member as a manager of an Accelo company.',
    {
      company_id: idParam.describe('The Accelo company ID'),
      manager_id: idParam.describe('The staff ID of the person to assign as manager'),
      nature: z.enum(['professional', 'confidential', 'private']).optional().default('professional').describe('Nature of the manager relationship'),
    },
    async ({ company_id, manager_id, nature }) => {
      try {
        const { data } = await client.post(`/companies/${company_id}/managers/add`, {
          manager_id,
          nature,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ company_id, managers: data }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `add_company_manager failed: ${err.message}` }],
        };
      }
    }
  );
}

module.exports = { registerCompanyTools };
