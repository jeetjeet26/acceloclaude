'use strict';

const { z } = require('zod');

function registerSalesTools(server, client) {
  // List prospects/sales
  server.tool(
    'list_prospects',
    'List sales prospects/opportunities in Accelo.',
    {
      search: z.string().optional().describe('Search by prospect title'),
      company_id: z.string().optional().describe('Filter by company'),
      status: z.enum(['active', 'inactive', 'won', 'lost', 'all']).optional().default('active'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ search, company_id, status, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'title,standing,company_id,contact_id,manager_id,date_created,date_due,value,probability',
      };
      if (search) params['_search'] = search;
      if (company_id) params['company_id'] = company_id;
      if (status && status !== 'all') params['standing'] = status;

      const { data, meta } = await client.get('/prospects', params);
      const prospects = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            prospects: prospects.map(p => ({
              id: p.id,
              title: p.title,
              status: p.standing,
              company_id: p.company_id,
              manager_id: p.manager_id,
              value: p.value,
              probability: p.probability,
              date_due: p.date_due,
            })),
            total: meta.more_info?.total_count || prospects.length,
          }, null, 2),
        }],
      };
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
    },
    async ({ search, limit }) => {
      const params = {
        '_limit': limit,
        '_fields': 'firstname,surname,email,title,standing',
      };
      if (search) params['_search'] = search;

      const { data } = await client.get('/staff', params);
      const staff = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            staff: staff.map(s => ({
              id: s.id,
              name: `${s.firstname || ''} ${s.surname || ''}`.trim(),
              email: s.email,
              title: s.title,
              status: s.standing,
            })),
          }, null, 2),
        }],
      };
    }
  );

  // Get invoices
  server.tool(
    'list_invoices',
    'List invoices in Accelo, optionally filtered by company or status.',
    {
      company_id: z.string().optional().describe('Filter by company'),
      status: z.enum(['draft', 'sent', 'paid', 'overdue', 'all']).optional().default('all'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ company_id, status, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'standing,company_id,date_created,date_due,date_paid,amount,tax,against_type,against_id',
      };
      if (company_id) params['company_id'] = company_id;
      if (status && status !== 'all') params['standing'] = status;

      const { data, meta } = await client.get('/invoices', params);
      const invoices = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            invoices: invoices.map(i => ({
              id: i.id,
              status: i.standing,
              company_id: i.company_id,
              date_created: i.date_created,
              date_due: i.date_due,
              date_paid: i.date_paid,
              amount: i.amount,
              tax: i.tax,
              against_type: i.against_type,
              against_id: i.against_id,
            })),
            total: meta.more_info?.total_count || invoices.length,
          }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerSalesTools, registerStaffTools };
