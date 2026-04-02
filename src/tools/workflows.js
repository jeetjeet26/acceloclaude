'use strict';

const { z } = require('zod');
const { listAcceloCollection } = require('../services/accelo-pagination');
const {
  normalizeAcceloList,
  resolveAcceloFields,
  withAcceloAliases,
} = require('../services/accelo-response');

const idParam = z.union([z.string(), z.number()]).transform(String);

function buildFilters(opts) {
  const parts = [];
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined && v !== null) parts.push(`${k}(${v})`);
  }
  return parts.length ? parts.join(',') : undefined;
}

function registerContributorTools(server, client) {
  server.tool(
    'list_contributors',
    'List contributors (people involved in work beyond the primary manager). Contributors link staff or contacts to jobs, issues, prospects, etc.',
    {
      against_type: z.enum(['job', 'issue', 'prospect', 'contract', 'milestone']).optional()
        .describe('Filter by what the contributor is assigned to'),
      against_id: idParam.optional().describe('ID of the object (requires against_type)'),
      object_type: z.enum(['staff', 'affiliation']).optional().describe('Filter by contributor type (staff or external contact)'),
      standing: z.enum(['active', 'inactive', 'all']).optional().default('all'),
      limit: z.number().int().min(1).max(100).optional().default(50),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ against_type, against_id, object_type, standing, limit, page, fetch_all, fields }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': resolveAcceloFields(fields),
      };
      const filters = buildFilters({
        ...(against_type ? { against_type } : {}),
        ...(against_id ? { against_id } : {}),
        ...(object_type ? { object_type } : {}),
        ...(standing && standing !== 'all' ? { standing } : {}),
      });
      if (filters) params['_filters'] = filters;

      const result = await listAcceloCollection(client, {
        path: '/contributors',
        params,
        fetchAll: fetch_all,
      });
      const contributors = result.items;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            contributors: contributors.map(c => ({
              ...withAcceloAliases(c, {
                contributor_type_id: 'contributor_type',
              }),
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
    }
  );
}

function registerProgressionTools(server, client) {
  server.tool(
    'list_progression_history',
    'List status change history across all objects (jobs, issues, prospects, tasks, etc.). Reveals workflow bottlenecks and timing.',
    {
      against_type: z.enum(['job', 'issue', 'prospect', 'task', 'milestone', 'company', 'contract', 'affiliation', 'contact']).optional()
        .describe('Filter by object type'),
      against_id: idParam.optional().describe('ID of the specific object'),
      modified_by: idParam.optional().describe('Filter by staff member who made the change'),
      date_after: z.string().optional().describe('Only changes after this date (YYYY-MM-DD)'),
      date_before: z.string().optional().describe('Only changes before this date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(100).optional().default(50),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ against_type, against_id, modified_by, date_after, date_before, limit, page, fetch_all, fields }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': resolveAcceloFields(fields),
      };
      const filters = buildFilters({
        ...(against_type ? { against_type } : {}),
        ...(against_id ? { against_id } : {}),
        ...(modified_by ? { modified_by } : {}),
        ...(date_after ? { date_modified_after: Math.floor(new Date(date_after).getTime() / 1000) } : {}),
        ...(date_before ? { date_modified_before: Math.floor(new Date(date_before).getTime() / 1000) } : {}),
      });
      if (filters) params['_filters'] = filters;

      const result = await listAcceloCollection(client, {
        path: '/progressions/history',
        params,
        fetchAll: fetch_all,
      });
      const history = result.items;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            progression_history: history.map(h => ({
              ...withAcceloAliases(h, {
                modified_by_id: 'modified_by',
              }),
              moved_to_status: h.to_title,
              to_status_id: h.to_id,
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
    }
  );

  server.tool(
    'list_progressions',
    'List available status progressions for a specific object (job, issue, prospect, task, etc.).',
    {
      resource_type: z.enum(['jobs', 'issues', 'prospects', 'tasks', 'milestones', 'companies', 'contracts', 'affiliations', 'contacts'])
        .describe('The resource type (plural)'),
      resource_id: idParam.describe('The ID of the specific object'),
    },
    async ({ resource_type, resource_id }) => {
      const { data } = await client.get(`/${resource_type}/${resource_id}/progressions`);
      const progressions = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            available_progressions: progressions.map(p => ({
              id: p.id,
              title: p.title,
              status: p.status,
            })),
          }, null, 2),
        }],
      };
    }
  );
}

function registerSegmentationTools(server, client) {
  server.tool(
    'list_segmentations',
    'List segmentations (categories) used to classify companies and contacts in Accelo. Useful for understanding client grouping and reporting dimensions.',
    {
      link_type: z.enum(['company', 'affiliation', 'contact']).optional().describe('Filter by what the segmentation applies to'),
      standing: z.enum(['active', 'inactive', 'all']).optional().default('active'),
      limit: z.number().int().min(1).max(100).optional().default(50),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ link_type, standing, limit, page, fetch_all, fields }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': resolveAcceloFields(fields),
      };
      const filters = buildFilters({
        ...(link_type ? { link_type } : {}),
        ...(standing && standing !== 'all' ? { standing } : {}),
      });
      if (filters) params['_filters'] = filters;

      const result = await listAcceloCollection(client, {
        path: '/segmentations',
        params,
        fetchAll: fetch_all,
      });
      const segs = result.items;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            segmentations: segs,
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
    }
  );
}

function registerSignoffTools(server, client) {
  server.tool(
    'list_signoffs',
    'List signoffs (client approval workflows) in Accelo. Tracks approval status for work on jobs/projects.',
    {
      against_type: z.enum(['job', 'issue', 'milestone']).optional().describe('Filter by object type'),
      against_id: idParam.optional().describe('ID of the object'),
      standing: z.enum(['draft', 'sent', 'approved', 'declined', 'all']).optional().default('all'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ against_type, against_id, standing, limit, page, fetch_all, fields }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': resolveAcceloFields(fields),
      };
      const filters = buildFilters({
        ...(against_type ? { against_type } : {}),
        ...(against_id ? { against_id } : {}),
        ...(standing && standing !== 'all' ? { standing } : {}),
      });
      if (filters) params['_filters'] = filters;

      const result = await listAcceloCollection(client, {
        path: '/signoffs',
        params,
        fetchAll: fetch_all,
      });
      const signoffs = result.items;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            signoffs: signoffs.map(s => ({
              ...s,
              created_by: s.created_by_id,
              preview: s.preview_body,
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
    }
  );
}

function registerResourceTools(server, client) {
  server.tool(
    'list_resources',
    'List resources (file attachments) uploaded to Accelo. Can filter by collection or activity.',
    {
      collection_id: idParam.optional().describe('Filter by collection/folder ID'),
      activity_id: idParam.optional().describe('Filter by the activity the resource was uploaded through'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ collection_id, activity_id, limit, page, fetch_all, fields }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': resolveAcceloFields(fields),
      };
      const filters = buildFilters({
        ...(collection_id ? { collection_id } : {}),
        ...(activity_id ? { activity_id } : {}),
      });
      if (filters) params['_filters'] = filters;

      const result = await listAcceloCollection(client, {
        path: '/resources',
        params,
        fetchAll: fetch_all,
      });
      const resources = result.items;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            resources: resources.map(r => ({
              ...withAcceloAliases(r, {
                collection_id: 'collection',
                owner_id: 'owner',
              }),
              filesize_kb: r.filesize ? (Number(r.filesize) / 1024).toFixed(1) : null,
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
    }
  );
}

module.exports = {
  registerContributorTools,
  registerProgressionTools,
  registerSegmentationTools,
  registerSignoffTools,
  registerResourceTools,
};
