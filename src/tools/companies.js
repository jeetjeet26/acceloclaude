'use strict';

const { z } = require('zod');

/**
 * Company & Contact tools — read-only
 */

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
      fields: z.string().optional().describe('Extra fields to include, e.g. "postal_address,phone,website"'),
    },
    async ({ search, status, limit, page, fields }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': fields || 'name,phone,website,standing',
      };
      if (search) params['_search'] = search;
      if (status && status !== 'all') params['standing'] = status;

      const { data, meta } = await client.get('/companies', params);
      const companies = Array.isArray(data) ? data : [data];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            companies: companies.map(c => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
              website: c.website,
              status: c.standing,
              ...c,
            })),
            total: meta.more_info?.total_count || companies.length,
            page,
          }, null, 2),
        }],
      };
    }
  );

  // Get single company
  server.tool(
    'get_company',
    'Get full details for a specific Accelo company by ID.',
    {
      company_id: z.string().describe('The Accelo company ID'),
      fields: z.string().optional().describe('Extra fields, e.g. "postal_address,contacts,staff"'),
    },
    async ({ company_id, fields }) => {
      const { data } = await client.get(`/companies/${company_id}`, {
        '_fields': fields || 'name,phone,website,standing,date_created,date_modified,postal_address',
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2),
        }],
      };
    }
  );

  // List contacts
  server.tool(
    'list_contacts',
    'List contacts in Accelo. Can filter by company or search by name/email.',
    {
      search: z.string().optional().describe('Search by name or email'),
      company_id: z.string().optional().describe('Filter contacts by company ID'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Max results'),
      page: z.number().int().min(0).optional().default(0).describe('Page offset'),
    },
    async ({ search, company_id, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'firstname,surname,email,phone,company_id,standing',
      };
      if (search) params['_search'] = search;
      if (company_id) params['company_id'] = company_id;

      const { data, meta } = await client.get('/contacts', params);
      const contacts = Array.isArray(data) ? data : [data];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            contacts: contacts.map(c => ({
              id: c.id,
              name: `${c.firstname || ''} ${c.surname || ''}`.trim(),
              email: c.email,
              phone: c.phone,
              company_id: c.company_id,
              status: c.standing,
            })),
            total: meta.more_info?.total_count || contacts.length,
          }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerCompanyTools };
