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

function buildDefinedBody(params, excludedKeys = []) {
  const body = {};

  for (const [key, value] of Object.entries(params)) {
    if (!excludedKeys.includes(key) && value !== undefined) {
      body[key] = value;
    }
  }

  return body;
}

async function updateJob(client, jobId, updates) {
  const body = buildDefinedBody(updates);
  if (!Object.keys(body).length) {
    throw new Error('Provide at least one field to update');
  }

  const { data } = await client.put(`/jobs/${jobId}`, body, {
    '_fields': '_ALL',
  });

  return data;
}

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
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ search, company_id, status, limit, page, fetch_all, fields }) => {
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
        const filterStr = AcceloClient.buildFilters(filters);
        if (filterStr) params['_filters'] = filterStr;

        const result = await listAcceloCollection(client, {
          path: '/jobs',
          params,
          fetchAll: fetch_all,
        });
        const projects = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              projects: projects.map(p => ({
                ...withAcceloAliases(p, {
                  company_id: 'company',
                  manager_id: 'manager',
                  affiliation_id: 'affiliation',
                  status_id: 'status',
                  type_id: ['job_type', 'type'],
                  rate_id: 'rate',
                }),
                status: p.standing,
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
          content: [{ type: 'text', text: `list_projects failed: ${err.message}` }],
        };
      }
    }
  );

  // Get single project
  server.tool(
    'get_project',
    'Get full details for a specific Accelo project/job by ID, including profile and extension values by default.',
    {
      project_id: idParam.describe('The Accelo project ID'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
      include_profile_values: z.boolean().optional().default(true).describe('Include project profile/custom field values'),
      include_extension_values: z.boolean().optional().default(true).describe('Include project extension field values'),
    },
    async ({ project_id, fields, include_profile_values, include_extension_values }) => {
      try {
        const { data } = await client.get(`/jobs/${project_id}`, {
          '_fields': resolveAcceloFields(fields),
        });
        const project = await attachAcceloCustomFields(client, {
          entity: 'jobs',
          objectId: project_id,
          record: {
            ...withAcceloAliases(data, {
              company_id: 'company',
              manager_id: 'manager',
              affiliation_id: 'affiliation',
              status_id: 'status',
              type_id: ['job_type', 'type'],
              rate_id: 'rate',
            }),
            status: data?.standing,
          },
          includeProfileValues: include_profile_values,
          includeExtensionValues: include_extension_values,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(project, null, 2),
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
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ project_id, status, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
        };

        const filters = [`job(${project_id})`];
        if (status && status !== 'all') {
          filters.push(`standing(${status})`);
        }
        const filterStr = AcceloClient.buildFilters(filters);
        if (filterStr) params['_filters'] = filterStr;

        const result = await listAcceloCollection(client, {
          path: '/milestones',
          params,
          fetchAll: fetch_all,
        });
        const milestones = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              project_id,
              milestones: milestones.map(m => ({
                ...withAcceloAliases(m, {
                  manager_id: 'manager',
                  status_id: 'status',
                }),
                status: m.standing,
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
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ project_id, limit, page, fetch_all, fields }) => {
      try {
        const params = {
          '_limit': limit,
          '_page': page,
          '_fields': resolveAcceloFields(fields),
          '_filters': `child_of_job(${project_id})`,
        };

        const result = await listAcceloCollection(client, {
          path: '/tasks',
          params,
          fetchAll: fetch_all,
        });
        const tasks = result.items;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              project_id,
              tasks: tasks.map(task => ({
                ...withAcceloAliases(task, {
                  company_id: 'company',
                  contact_id: 'contact',
                  affiliation_id: 'affiliation',
                  assignee_id: 'assignee',
                  manager_id: 'manager',
                  status_id: 'status',
                  type_id: ['task_type', 'type'],
                }),
                status: task.standing,
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
          content: [{ type: 'text', text: `list_project_tasks failed: ${err.message}` }],
        };
      }
    }
  );
  // Update an existing task
  server.tool(
    'update_task',
    'Update an existing Accelo task. Use this to edit task title, description, assignment, status, or dates.',
    {
      task_id: idParam.describe('The Accelo task ID to update'),
      title: z.string().optional().describe('New title for the task'),
      description: z.string().optional().describe('Updated description of the task'),
      status_id: idParam.optional().describe('ID of the updated task status'),
      manager_id: idParam.optional().describe('Staff ID of the task manager'),
      assignee_id: idParam.optional().describe('Staff ID to assign the task to'),
      affiliation_id: idParam.optional().describe('Affiliation ID to link to the task'),
      priority_id: idParam.optional().describe('Priority ID for the task'),
      date_started: z.string().optional().describe('Start date as unix timestamp'),
      date_due: z.string().optional().describe('Due date as unix timestamp'),
      date_completed: z.string().optional().describe('Completion date as unix timestamp'),
    },
    async ({ task_id, ...updates }) => {
      try {
        const body = buildDefinedBody(updates);
        if (!Object.keys(body).length) {
          throw new Error('Provide at least one field to update');
        }

        const { data } = await client.put(`/tasks/${task_id}`, body, {
          '_fields': '_ALL',
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              updated_task: {
                ...withAcceloAliases(data, {
                  company_id: 'company',
                  contact_id: 'contact',
                  affiliation_id: 'affiliation',
                  assignee_id: 'assignee',
                  manager_id: 'manager',
                  status_id: 'status',
                  type_id: ['task_type', 'type'],
                }),
                status: data?.standing,
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `update_task failed: ${err.message}` }],
        };
      }
    }
  );

  // Create a task
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
        const body = buildDefinedBody(params);

        const { data } = await client.post('/tasks', body, {
          '_fields': '_ALL',
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              created_task: {
                ...withAcceloAliases(data, {
                  company_id: 'company',
                  contact_id: 'contact',
                  affiliation_id: 'affiliation',
                  assignee_id: 'assignee',
                  manager_id: 'manager',
                  status_id: 'status',
                  type_id: ['task_type', 'type'],
                }),
                status: data?.standing,
              },
            }, null, 2),
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

  // Update an existing job/project
  server.tool(
    'update_job',
    'Update an existing Accelo job (project). Use this to edit project title, description, manager, status, billing, or dates.',
    {
      job_id: idParam.describe('The Accelo job/project ID to update'),
      title: z.string().optional().describe('Updated title for the job'),
      description: z.string().optional().describe('Updated description for the job'),
      manager_id: idParam.optional().describe('Staff ID of the job manager'),
      status_id: idParam.optional().describe('ID of the updated job status'),
      affiliation_id: idParam.optional().describe('Affiliation ID to link to the job'),
      contract_id: idParam.optional().describe('Contract ID to link to the job'),
      rate_id: idParam.optional().describe('Rate ID for the job'),
      rate_charged: z.string().optional().describe('Rate charged for billable work'),
      date_due: z.string().optional().describe('Due date as unix timestamp'),
      date_started: z.string().optional().describe('Start date as unix timestamp'),
      date_completed: z.string().optional().describe('Completion date as unix timestamp'),
      is_billable: z.enum(['yes', 'no']).optional().describe('Whether the job is billable'),
    },
    async ({ job_id, ...updates }) => {
      try {
        const data = await updateJob(client, job_id, updates);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              updated_job: {
                ...withAcceloAliases(data, {
                  company_id: 'company',
                  manager_id: 'manager',
                  affiliation_id: 'affiliation',
                  status_id: 'status',
                  type_id: ['job_type', 'type'],
                  rate_id: 'rate',
                }),
                status: data?.standing,
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `update_job failed: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    'update_project',
    'Update an existing Accelo project. Alias for update_job that accepts project_id to match the project-oriented tools.',
    {
      project_id: idParam.describe('The Accelo project ID to update'),
      title: z.string().optional().describe('Updated title for the project'),
      description: z.string().optional().describe('Updated description for the project'),
      manager_id: idParam.optional().describe('Staff ID of the project manager'),
      status_id: idParam.optional().describe('ID of the updated project status'),
      affiliation_id: idParam.optional().describe('Affiliation ID to link to the project'),
      contract_id: idParam.optional().describe('Contract ID to link to the project'),
      rate_id: idParam.optional().describe('Rate ID for the project'),
      rate_charged: z.string().optional().describe('Rate charged for billable work'),
      date_due: z.string().optional().describe('Due date as unix timestamp'),
      date_started: z.string().optional().describe('Start date as unix timestamp'),
      date_completed: z.string().optional().describe('Completion date as unix timestamp'),
      is_billable: z.enum(['yes', 'no']).optional().describe('Whether the project is billable'),
    },
    async ({ project_id, ...updates }) => {
      try {
        const data = await updateJob(client, project_id, updates);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              updated_project: {
                ...withAcceloAliases(data, {
                  company_id: 'company',
                  manager_id: 'manager',
                  affiliation_id: 'affiliation',
                  status_id: 'status',
                  type_id: ['job_type', 'type'],
                  rate_id: 'rate',
                }),
                status: data?.standing,
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `update_project failed: ${err.message}` }],
        };
      }
    }
  );

  // Create a new job/project
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
        const body = buildDefinedBody(params);

        const { data } = await client.post('/jobs', body, {
          '_fields': '_ALL',
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              created_job: {
                ...withAcceloAliases(data, {
                  company_id: 'company',
                  manager_id: 'manager',
                  affiliation_id: 'affiliation',
                  status_id: 'status',
                  type_id: ['job_type', 'type'],
                  rate_id: 'rate',
                }),
                status: data?.standing,
              },
            }, null, 2),
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
