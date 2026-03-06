'use strict';

const { z } = require('zod');
const { AcceloClient } = require('../services/accelo-client');

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

      const filters = [];
      if (company_id) filters.push(`company(${company_id})`);
      if (status && status !== 'all') filters.push(`standing(${status})`);
      const filterStr = AcceloClient.buildFilters(filters);
      if (filterStr) params['_filters'] = filterStr;

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
    'List invoices in Accelo. Supports filtering by affiliation, date range, and search. Note: the Accelo API does not support filtering invoices directly by company_id or standing.',
    {
      affiliation_id: z.string().optional().describe('Filter by affiliation ID (links invoices to a company/contact)'),
      search: z.string().optional().describe('Search invoices by subject'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ affiliation_id, search, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'subject,outstanding,amount,tax,affiliation_id,against_type,against_id,date_raised,date_due,date_modified,owner_id,invoice_number',
      };
      if (search) params['_search'] = search;

      const filters = [];
      if (affiliation_id) filters.push(`affiliation(${affiliation_id})`);
      const filterStr = AcceloClient.buildFilters(filters);
      if (filterStr) params['_filters'] = filterStr;

      const { data, meta } = await client.get('/invoices', params);
      const invoices = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            invoices: invoices.map(i => ({
              id: i.id,
              subject: i.subject,
              invoice_number: i.invoice_number,
              amount: i.amount,
              tax: i.tax,
              outstanding: i.outstanding,
              affiliation_id: i.affiliation_id,
              against_type: i.against_type,
              against_id: i.against_id,
              date_raised: i.date_raised,
              date_due: i.date_due,
            })),
            total: meta.more_info?.total_count || invoices.length,
          }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerSalesTools, registerStaffTools };
