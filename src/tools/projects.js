'use strict';

const { z } = require('zod');

function registerProjectTools(server, client) {
  // List projects
  server.tool(
    'list_projects',
    'List projects (jobs) in Accelo. Filter by status, company, or search by title.',
    {
      search: z.string().optional().describe('Search by project title'),
      company_id: z.string().optional().describe('Filter by client company ID'),
      status: z.enum(['active', 'inactive', 'complete', 'cancelled', 'all']).optional().default('active'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ search, company_id, status, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'title,standing,company_id,manager_id,date_created,date_commenced,date_due,date_completed,budget,rate_charged,billable,value,staff',
      };
      if (search) params['_search'] = search;
      if (company_id) params['company_id'] = company_id;
      if (status && status !== 'all') params['standing'] = status;

      const { data, meta } = await client.get('/jobs', params);
      const projects = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            projects: projects.map(p => ({
              id: p.id,
              title: p.title,
              status: p.standing,
              company_id: p.company_id,
              manager_id: p.manager_id,
              date_created: p.date_created,
              date_commenced: p.date_commenced,
              date_due: p.date_due,
              date_completed: p.date_completed,
              budget: p.budget,
              rate_charged: p.rate_charged,
              billable: p.billable,
              value: p.value,
            })),
            total: meta.more_info?.total_count || projects.length,
          }, null, 2),
        }],
      };
    }
  );

  // Get single project
  server.tool(
    'get_project',
    'Get full details for a specific Accelo project/job by ID, including milestones and tasks.',
    {
      project_id: z.string().describe('The Accelo project ID'),
    },
    async ({ project_id }) => {
      const { data } = await client.get(`/jobs/${project_id}`, {
        '_fields': 'title,standing,company_id,manager_id,description,date_created,date_commenced,date_due,date_completed,budget,rate_charged,billable,value,staff',
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2),
        }],
      };
    }
  );

  // List project tasks (milestones)
  server.tool(
    'list_project_tasks',
    'List tasks/milestones for a specific Accelo project.',
    {
      project_id: z.string().describe('The Accelo project ID'),
      limit: z.number().int().min(1).max(100).optional().default(50),
    },
    async ({ project_id, limit }) => {
      const { data } = await client.get(`/jobs/${project_id}/tasks`, {
        '_limit': limit,
        '_fields': 'title,standing,date_created,date_started,date_due,date_completed,assignee,budget,logged_budget',
      });
      const tasks = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ project_id, tasks }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerProjectTools };
