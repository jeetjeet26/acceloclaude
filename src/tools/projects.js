'use strict';

const { z } = require('zod');
const { AcceloClient } = require('../services/accelo-client');

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

      const filters = [];
      if (company_id) filters.push(`against(company(${company_id}))`);
      if (status && status !== 'all') filters.push(`standing(${status})`);
      const filterStr = AcceloClient.buildFilters(filters);
      if (filterStr) params['_filters'] = filterStr;

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
        '_fields': 'title,standing,company_id,manager_id,description,date_created,date_commenced,date_due,date_completed,budget,rate_charged,billable,value',
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
  // Create a task (POST only — no edit, no delete)
  server.tool(
    'create_task',
    'Create a new task in Accelo. Link it to a job, issue, or other object via against_type + against_id.',
    {
      title: z.string().describe('Title for the new task'),
      against_type: z.string().optional().describe('Type of parent object (e.g. "job", "issue", "milestone")'),
      against_id: z.string().optional().describe('ID of the parent object'),
      description: z.string().optional().describe('Description of the task'),
      status_id: z.string().optional().describe('ID of the initial task status'),
      manager_id: z.string().optional().describe('Staff ID of the task manager'),
      assignee_id: z.string().optional().describe('Staff ID to assign the task to'),
      affiliation_id: z.string().optional().describe('Affiliation ID to link to the task'),
      priority_id: z.string().optional().describe('Priority ID for the task'),
      date_started: z.string().optional().describe('Start date as unix timestamp'),
      date_due: z.string().optional().describe('Due date as unix timestamp'),
    },
    async (params) => {
      const body = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) body[key] = value;
      }

      const { data } = await client.post('/tasks', body, {
        '_fields': 'title,standing,date_created,date_started,date_due,date_completed,assignee,against_type,against_id,manager_id,description',
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ created_task: data }, null, 2),
        }],
      };
    }
  );

  // Create a new job/project (POST only — no edit, no delete)
  server.tool(
    'create_job',
    'Create a new job (project) in Accelo. Returns the created job. Only type_id is required; provide against_type + against_id to link to a company or other object.',
    {
      type_id: z.string().describe('Required — the ID of a valid Accelo job type'),
      title: z.string().optional().describe('Title for the new job'),
      against_type: z.string().optional().describe('The type of object this job is against (e.g. "company")'),
      against_id: z.string().optional().describe('The ID of the object this job is against'),
      manager_id: z.string().optional().describe('Staff ID of the job manager'),
      status_id: z.string().optional().describe('ID of the initial job status'),
      affiliation_id: z.string().optional().describe('Affiliation ID to link to the job'),
      contract_id: z.string().optional().describe('Contract ID to link to the job'),
      rate_id: z.string().optional().describe('Rate ID for the job'),
      rate_charged: z.string().optional().describe('Rate charged for billable work'),
      date_due: z.string().optional().describe('Due date as unix timestamp'),
      date_started: z.string().optional().describe('Start date as unix timestamp'),
      is_billable: z.enum(['yes', 'no']).optional().describe('Whether the job is billable'),
    },
    async (params) => {
      const body = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) body[key] = value;
      }

      const { data } = await client.post('/jobs', body, {
        '_fields': 'title,standing,company_id,manager_id,date_created,date_commenced,date_due,date_completed,budget,rate_charged,billable,value,job_type',
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ created_job: data }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerProjectTools };
