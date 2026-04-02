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

function registerIssueTools(server, client) {
  server.tool(
    'list_issues',
    'List support tickets/issues in Accelo (called "Tickets" in P11\'s deployment). Filter by status, company, or search.',
    {
      search: z.string().optional().describe('Search by ticket title'),
      company_id: idParam.optional().describe('Filter by company ID'),
      status: z.enum(['open', 'closed', 'pending', 'all']).optional().default('open'),
      assignee_id: idParam.optional().describe('Filter by assigned staff ID'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ search, company_id, status, assignee_id, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };
        if (search) params['_search'] = search;

        const filters = [];
        if (company_id) filters.push(`against(company(${company_id}))`);
        if (status && status !== 'all') filters.push(`standing(${status})`);
        if (assignee_id) filters.push(`assignee(${assignee_id})`);
        const filterStr = AcceloClient.buildFilters(filters);
        if (filterStr) params['_filters'] = filterStr;

        const result = await listAcceloCollection(client, {
          path: '/issues',
          params,
          fetchAll: fetch_all,
        });
        const issues = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tickets: issues.map(i => ({
                ...withAcceloAliases(i, {
                  company_id: 'company',
                  contact_id: 'contact',
                  affiliation_id: 'affiliation',
                  assignee_id: 'assignee',
                  type_id: ['issue_type', 'type'],
                  priority_id: ['issue_priority', 'priority'],
                  class_id: 'class',
                  status_id: 'status',
                }),
                status: i.standing,
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
          content: [{ type: 'text', text: `list_issues failed: ${err.message}` }],
        };
      }
    }
  );

  // Create a new issue/service ticket (POST only — no edit, no delete)
  server.tool(
    'create_issue',
    'Create a new service ticket (issue) in Accelo. Use against_type + against_id to link it to a company or other object.',
    {
      title: z.string().describe('Title for the new ticket'),
      type_id: idParam.optional().describe('ID of a valid issue type (see list_issue_types)'),
      against_type: z.string().optional().describe('Type of object this issue is against (e.g. "company")'),
      against_id: idParam.optional().describe('ID of the object this issue is against'),
      description: z.string().optional().describe('Description / body of the issue'),
      standing: z.enum(['submitted', 'open', 'resolved', 'closed', 'inactive']).optional().describe('Initial standing for the issue'),
      status_id: idParam.optional().describe('ID of the initial issue status (more precise than standing)'),
      class_id: idParam.optional().describe('ID of the issue class'),
      affiliation_id: idParam.optional().describe('Affiliation ID to link to the issue'),
      assignee: idParam.optional().describe('Staff ID to assign the issue to'),
      priority_id: idParam.optional().describe('Priority ID for the issue'),
      date_started: z.string().optional().describe('Start date as unix timestamp'),
      date_due: z.string().optional().describe('Due date as unix timestamp'),
    },
    async (params) => {
      try {
        const body = {};
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) body[key] = value;
        }

        const { data } = await client.post('/issues', body, {
          '_fields': '_ALL',
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              created_issue: {
                ...withAcceloAliases(data, {
                  company_id: 'company',
                  contact_id: 'contact',
                  affiliation_id: 'affiliation',
                  assignee_id: 'assignee',
                  type_id: ['issue_type', 'type'],
                  priority_id: ['issue_priority', 'priority'],
                  class_id: 'class',
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
          content: [{ type: 'text', text: `create_issue failed: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    'get_issue',
    'Get full details for a specific Accelo ticket/issue by ID, including profile and extension values by default.',
    {
      issue_id: idParam.describe('The Accelo issue/ticket ID'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
      include_profile_values: z.boolean().optional().default(true).describe('Include issue profile/custom field values'),
      include_extension_values: z.boolean().optional().default(true).describe('Include issue extension field values'),
    },
    async ({ issue_id, fields, include_profile_values, include_extension_values }) => {
      try {
        const { data } = await client.get(`/issues/${issue_id}`, {
          '_fields': resolveAcceloFields(fields),
        });
        const issue = await attachAcceloCustomFields(client, {
          entity: 'issues',
          objectId: issue_id,
          record: {
            ...withAcceloAliases(data, {
              company_id: 'company',
              contact_id: 'contact',
              affiliation_id: 'affiliation',
              assignee_id: 'assignee',
              type_id: ['issue_type', 'type'],
              priority_id: ['issue_priority', 'priority'],
              class_id: 'class',
              status_id: 'status',
            }),
            status: data?.standing,
          },
          includeProfileValues: include_profile_values,
          includeExtensionValues: include_extension_values,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(issue, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `get_issue failed: ${err.message}` }],
        };
      }
    }
  );
}

function registerRetainerTools(server, client) {
  server.tool(
    'list_retainers',
    'List retainers/contracts in Accelo (called "Retainers" in P11\'s deployment). Filter by company or status.',
    {
      company_id: idParam.optional().describe('Filter by company ID'),
      status: z.enum(['active', 'inactive', 'complete', 'cancelled', 'all']).optional().default('active'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ company_id, status, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };

        const filters = [];
        if (company_id) filters.push(`against(company(${company_id}))`);
        if (status && status !== 'all') filters.push(`standing(${status})`);
        const filterStr = AcceloClient.buildFilters(filters);
        if (filterStr) params['_filters'] = filterStr;

        const result = await listAcceloCollection(client, {
          path: '/contracts',
          params,
          fetchAll: fetch_all,
        });
        const retainers = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              retainers: retainers.map(r => ({
                ...withAcceloAliases(r, {
                  company_id: 'company',
                  manager_id: 'manager',
                  affiliation_id: 'affiliation',
                  status_id: 'status',
                  type_id: ['contract_type', 'type'],
                }),
                status: r.standing,
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
          content: [{ type: 'text', text: `list_retainers failed: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    'get_retainer',
    'Get full details for a specific Accelo retainer/contract by ID, including profile and extension values by default.',
    {
      retainer_id: idParam.describe('The Accelo contract/retainer ID'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
      include_profile_values: z.boolean().optional().default(true).describe('Include retainer profile/custom field values'),
      include_extension_values: z.boolean().optional().default(true).describe('Include retainer extension field values'),
    },
    async ({ retainer_id, fields, include_profile_values, include_extension_values }) => {
      try {
        const { data } = await client.get(`/contracts/${retainer_id}`, {
          '_fields': resolveAcceloFields(fields),
        });
        const retainer = await attachAcceloCustomFields(client, {
          entity: 'contracts',
          objectId: retainer_id,
          record: {
            ...withAcceloAliases(data, {
              company_id: 'company',
              manager_id: 'manager',
              affiliation_id: 'affiliation',
              status_id: 'status',
              type_id: ['contract_type', 'type'],
            }),
            status: data?.standing,
          },
          includeProfileValues: include_profile_values,
          includeExtensionValues: include_extension_values,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(retainer, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `get_retainer failed: ${err.message}` }],
        };
      }
    }
  );
}

module.exports = { registerIssueTools, registerRetainerTools };
