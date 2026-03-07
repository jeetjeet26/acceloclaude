'use strict';

const { z } = require('zod');
const { AcceloClient } = require('../services/accelo-client');

const idParam = z.union([z.string(), z.number()]).transform(String);

function registerProjectTools(server, client) {
  // List projects
  server.tool(
    'list_projects',
    'List projects (jobs) in Accelo. Filter by status, company, or search by title.',
    {
      search: z.string().optional().describe('Search by project title'),
      company_id: idParam.optional().describe('Filter by client company ID'),
      status: z.enum(['active', 'inactive', 'complete', 'cancelled', 'all']).optional().default('active'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ search, company_id, status, limit, page }) => {
      try {
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
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `list_projects failed: ${err.message}` }],
        };
      }
    }
  );

  // Get single project
  server.tool(
    'get_project',
    'Get full details for a specific Accelo project/job by ID, including milestones and tasks.',
    {
      project_id: idParam.describe('The Accelo project ID'),
    },
    async ({ project_id }) => {
      try {
        const { data } = await client.get(`/jobs/${project_id}`, {
          '_fields': 'title,standing,company_id,manager_id,description,date_created,date_commenced,date_due,date_completed,budget,rate_charged,billable,value',
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `get_project failed: ${err.message}` }],
        };
      }
    }
  );

  // List project milestones (sub-items of a job)
  server.tool(
    'list_project_milestones',
    'List milestones (sub-tasks) for a specific Accelo project/job. In Accelo, milestones are the work breakdown items within a job.',
    {
      project_id: idParam.describe('The Accelo project/job ID'),
      status: z.enum(['active', 'inactive', 'complete', 'cancelled', 'all']).optional().default('all'),
      limit: z.number().int().min(1).max(100).optional().default(50),
    },
    async ({ project_id, status, limit }) => {
      try {
        const params = {
          '_limit': limit,
          '_fields': 'title,standing,date_created,date_started,date_commenced,date_due,date_completed,manager,budget,logged,charged,ordering,status',
        };

        if (status && status !== 'all') {
          params['_filters'] = `standing(${status})`;
        }

        const { data, meta } = await client.get(`/jobs/${project_id}/milestones`, params);
        const milestones = Array.isArray(data) ? data : (data ? [data] : []);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              project_id,
              milestones: milestones.map(m => ({
                id: m.id,
                title: m.title,
                status: m.standing,
                date_created: m.date_created,
                date_started: m.date_started,
                date_commenced: m.date_commenced,
                date_due: m.date_due,
                date_completed: m.date_completed,
                manager_id: typeof m.manager === 'object' ? m.manager?.id : m.manager,
                budget: m.budget,
                logged: m.logged,
                charged: m.charged,
                ordering: m.ordering,
              })),
              total: meta?.more_info?.total_count || milestones.length,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `list_project_milestones failed: ${err.message}` }],
        };
      }
    }
  );

  // List tasks against a specific object (job, issue, milestone, etc.)
  server.tool(
    'list_project_tasks',
    'List tasks for a specific Accelo project. Uses the /tasks endpoint filtered by job ID.',
    {
      project_id: idParam.describe('The Accelo project/job ID'),
      limit: z.number().int().min(1).max(100).optional().default(50),
    },
    async ({ project_id, limit }) => {
      try {
        const params = {
          '_limit': limit,
          '_fields': 'title,standing,date_created,date_started,date_due,date_completed,assignee,against_type,against_id,manager_id,description',
          '_filters': `against_type(job),against_id(${project_id})`,
        };

        const { data, meta } = await client.get('/tasks', params);
        const tasks = Array.isArray(data) ? data : (data ? [data] : []);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ project_id, tasks, total: meta?.more_info?.total_count || tasks.length }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `list_project_tasks failed: ${err.message}` }],
        };
      }
    }
  );
  // Create a task (POST only — no edit, no delete)
  server.tool(
    'create_task',
    'Create a new task in Accelo. Link it to a job, issue, or other object via against_type + against_id.',
    {
      title: z.string().describe('Title for the new task'),
      against_type: z.string().optional().describe('Type of parent object (e.g. "job", "issue", "milestone")'),
      against_id: idParam.optional().describe('ID of the parent object'),
      description: z.string().optional().describe('Description of the task'),
      status_id: idParam.optional().describe('ID of the initial task status'),
      manager_id: idParam.optional().describe('Staff ID of the task manager'),
      assignee_id: idParam.optional().describe('Staff ID to assign the task to'),
      affiliation_id: idParam.optional().describe('Affiliation ID to link to the task'),
      priority_id: idParam.optional().describe('Priority ID for the task'),
      date_started: z.string().optional().describe('Start date as unix timestamp'),
      date_due: z.string().optional().describe('Due date as unix timestamp'),
    },
    async (params) => {
      try {
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
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `create_task failed: ${err.message}` }],
        };
      }
    }
  );

  // Create a new job/project (POST only — no edit, no delete)
  server.tool(
    'create_job',
    'Create a new job (project) in Accelo. Returns the created job. Only type_id is required; provide against_type + against_id to link to a company or other object.',
    {
      type_id: idParam.describe('Required — the ID of a valid Accelo job type'),
      title: z.string().optional().describe('Title for the new job'),
      against_type: z.string().optional().describe('The type of object this job is against (e.g. "company")'),
      against_id: idParam.optional().describe('The ID of the object this job is against'),
      manager_id: idParam.optional().describe('Staff ID of the job manager'),
      status_id: idParam.optional().describe('ID of the initial job status'),
      affiliation_id: idParam.optional().describe('Affiliation ID to link to the job'),
      contract_id: idParam.optional().describe('Contract ID to link to the job'),
      rate_id: idParam.optional().describe('Rate ID for the job'),
      rate_charged: z.string().optional().describe('Rate charged for billable work'),
      date_due: z.string().optional().describe('Due date as unix timestamp'),
      date_started: z.string().optional().describe('Start date as unix timestamp'),
      is_billable: z.enum(['yes', 'no']).optional().describe('Whether the job is billable'),
    },
    async (params) => {
      try {
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
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `create_job failed: ${err.message}` }],
        };
      }
    }
  );
}

module.exports = { registerProjectTools };
