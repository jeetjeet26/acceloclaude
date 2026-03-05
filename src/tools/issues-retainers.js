'use strict';

const { z } = require('zod');

function registerIssueTools(server, client) {
  server.tool(
    'list_issues',
    'List support tickets/issues in Accelo (called "Tickets" in P11\'s deployment). Filter by status, company, or search.',
    {
      search: z.string().optional().describe('Search by ticket title'),
      company_id: z.string().optional().describe('Filter by company ID'),
      status: z.enum(['open', 'closed', 'pending', 'all']).optional().default('open'),
      assignee_id: z.string().optional().describe('Filter by assigned staff ID'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ search, company_id, status, assignee_id, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'title,standing,company_id,contact_id,assignee,date_created,date_modified,date_due,type_id,priority',
      };
      if (search) params['_search'] = search;
      if (company_id) params['company_id'] = company_id;
      if (status && status !== 'all') params['standing'] = status;
      if (assignee_id) params['assignee_id'] = assignee_id;

      const { data, meta } = await client.get('/issues', params);
      const issues = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            tickets: issues.map(i => ({
              id: i.id,
              title: i.title,
              status: i.standing,
              company_id: i.company_id,
              assignee: i.assignee,
              priority: i.priority,
              date_created: i.date_created,
              date_due: i.date_due,
            })),
            total: meta.more_info?.total_count || issues.length,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_issue',
    'Get full details for a specific Accelo ticket/issue by ID.',
    {
      issue_id: z.string().describe('The Accelo issue/ticket ID'),
    },
    async ({ issue_id }) => {
      const { data } = await client.get(`/issues/${issue_id}`, {
        '_fields': 'title,standing,body,company_id,contact_id,assignee,date_created,date_modified,date_due,resolution,type_id,priority,class_id',
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

function registerRetainerTools(server, client) {
  server.tool(
    'list_retainers',
    'List retainers/contracts in Accelo (called "Retainers" in P11\'s deployment). Filter by company or status.',
    {
      company_id: z.string().optional().describe('Filter by company ID'),
      status: z.enum(['active', 'inactive', 'complete', 'cancelled', 'all']).optional().default('active'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ company_id, status, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'title,standing,company_id,manager_id,date_created,date_commenced,date_expires,budget,rate_charged,value,period_template_id,auto_renew,type_id',
      };
      if (company_id) params['company_id'] = company_id;
      if (status && status !== 'all') params['standing'] = status;

      const { data, meta } = await client.get('/contracts', params);
      const retainers = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            retainers: retainers.map(r => ({
              id: r.id,
              title: r.title,
              status: r.standing,
              company_id: r.company_id,
              manager_id: r.manager_id,
              date_commenced: r.date_commenced,
              date_expires: r.date_expires,
              budget: r.budget,
              rate_charged: r.rate_charged,
              value: r.value,
              period_template_id: r.period_template_id,
              auto_renew: r.auto_renew,
            })),
            total: meta.more_info?.total_count || retainers.length,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_retainer',
    'Get full details for a specific Accelo retainer/contract by ID.',
    {
      retainer_id: z.string().describe('The Accelo contract/retainer ID'),
    },
    async ({ retainer_id }) => {
      const { data } = await client.get(`/contracts/${retainer_id}`, {
        '_fields': 'title,standing,company_id,manager_id,date_created,date_commenced,date_expires,budget,rate_charged,value,period_template_id,auto_renew,type_id',
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

module.exports = { registerIssueTools, registerRetainerTools };
