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
      parent_id: z.string().optional().describe('ID of a parent company'),
      status_id: z.string().optional().describe('ID of the company status'),
      standing: z.enum(['active', 'inactive']).optional().describe('Company standing (overridden if status_id is also sent)'),
    },
    async (params) => {
      const body = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) body[key] = value;
      }

      const { data } = await client.post('/companies', body, {
        '_fields': 'name,phone,website,standing,date_created,comments',
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ created_company: data }, null, 2),
        }],
      };
    }
  );
  // Add a manager to a company (POST only)
  server.tool(
    'add_company_manager',
    'Assign a staff member as a manager of an Accelo company.',
    {
      company_id: z.string().describe('The Accelo company ID'),
      manager_id: z.string().describe('The staff ID of the person to assign as manager'),
      nature: z.enum(['professional', 'confidential', 'private']).optional().default('professional').describe('Nature of the manager relationship'),
    },
    async ({ company_id, manager_id, nature }) => {
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
    }
  );
}

module.exports = { registerCompanyTools };
