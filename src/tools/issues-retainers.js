'use strict';

const { z } = require('zod');
const { AcceloClient } = require('../services/accelo-client');

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

      const filters = [];
      if (company_id) filters.push(`against(company(${company_id}))`);
      if (status && status !== 'all') filters.push(`standing(${status})`);
      if (assignee_id) filters.push(`assignee(${assignee_id})`);
      const filterStr = AcceloClient.buildFilters(filters);
      if (filterStr) params['_filters'] = filterStr;

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

  // Create a new issue/service ticket (POST only — no edit, no delete)
  server.tool(
    'create_issue',
    'Create a new service ticket (issue) in Accelo. Use against_type + against_id to link it to a company or other object.',
    {
      title: z.string().describe('Title for the new ticket'),
      type_id: z.string().optional().describe('ID of a valid issue type (see list_issue_types)'),
      against_type: z.string().optional().describe('Type of object this issue is against (e.g. "company")'),
      against_id: z.string().optional().describe('ID of the object this issue is against'),
      description: z.string().optional().describe('Description / body of the issue'),
      standing: z.enum(['submitted', 'open', 'resolved', 'closed', 'inactive']).optional().describe('Initial standing for the issue'),
      status_id: z.string().optional().describe('ID of the initial issue status (more precise than standing)'),
      class_id: z.string().optional().describe('ID of the issue class'),
      affiliation_id: z.string().optional().describe('Affiliation ID to link to the issue'),
      assignee: z.string().optional().describe('Staff ID to assign the issue to'),
      priority_id: z.string().optional().describe('Priority ID for the issue'),
      date_started: z.string().optional().describe('Start date as unix timestamp'),
      date_due: z.string().optional().describe('Due date as unix timestamp'),
    },
    async (params) => {
      const body = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) body[key] = value;
      }

      const { data } = await client.post('/issues', body, {
        '_fields': 'title,standing,company_id,contact_id,assignee,date_created,date_due,type_id,priority,class_id,description',
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ created_issue: data }, null, 2),
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

      const filters = [];
      if (company_id) filters.push(`against(company(${company_id}))`);
      if (status && status !== 'all') filters.push(`standing(${status})`);
      const filterStr = AcceloClient.buildFilters(filters);
      if (filterStr) params['_filters'] = filterStr;

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
