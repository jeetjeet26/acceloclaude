'use strict';

const { z } = require('zod');
const { listAcceloCollection } = require('../services/accelo-pagination');
const {
  normalizeAcceloList,
  resolveAcceloFields,
  withAcceloAliases,
} = require('../services/accelo-response');

const idParam = z.union([z.string(), z.number()]).transform(String);
const ENTITY_TYPES = ['jobs', 'companies', 'contacts', 'contracts', 'issues', 'prospects', 'affiliations', 'milestones', 'invoices', 'staff', 'expenses', 'assets', 'contributors', 'purchases'];
const EXTENSION_ENTITY_TYPES = ['jobs', 'issues', 'contracts', 'prospects', 'assets'];

function buildFilters(opts) {
  const parts = [];
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined && v !== null) parts.push(`${k}(${v})`);
  }
  return parts.length ? parts.join(',') : undefined;
}

function registerLookupTools(server, client) {
  server.tool(
    'list_statuses',
    'List all statuses for a given entity type (jobs, companies, issues, contracts, prospects, contacts, affiliations). Returns ID, title, standing, and color.',
    {
      entity: z.enum(['jobs', 'companies', 'contacts', 'contracts', 'issues', 'prospects', 'affiliations'])
        .describe('The entity type to list statuses for'),
    },
    async ({ entity }) => {
      const { data } = await client.get(`/${entity}/statuses`, {
        '_limit': 100,
        '_fields': 'title,standing,color,start,ordering',
      });
      const statuses = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            entity,
            statuses: statuses.map(s => ({
              id: s.id,
              title: s.title,
              standing: s.standing,
              color: s.color,
              start: s.start,
              ordering: s.ordering,
            })),
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'list_entity_types',
    'List all types for a given entity (jobs, issues, contracts, prospects, expenses, assets, contributors). Returns type ID, title, and standing.',
    {
      entity: z.enum(['jobs', 'issues', 'contracts', 'prospects', 'expenses', 'assets', 'contributors'])
        .describe('The entity type to list types for'),
    },
    async ({ entity }) => {
      const { data } = await client.get(`/${entity}/types`, {
        '_limit': 100,
        '_fields': 'title,standing,parent,ordering',
      });
      const types = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            entity,
            types: types.map(t => ({
              id: t.id,
              title: t.title,
              standing: t.standing,
              parent: t.parent,
              ordering: t.ordering,
            })),
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'list_rates',
    'List billing rates configured in Accelo. Returns rate ID, title, and charge amount.',
    {},
    async () => {
      const { data } = await client.get('/rates', {
        '_limit': 100,
        '_fields': 'title,charged,standing',
      });
      const rates = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            rates: rates.map(r => ({
              id: r.id,
              title: r.title,
              charged: r.charged,
              standing: r.standing,
            })),
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'list_tags',
    'List tags (service categories) in Accelo. Can filter to tags applied to a specific object.',
    {
      search: z.string().optional().describe('Search by tag name'),
      against_type: z.string().optional().describe('Filter to tags on this object type (e.g. "job")'),
      against_id: idParam.optional().describe('Filter to tags on this specific object (requires against_type)'),
      limit: z.number().int().min(1).max(100).optional().default(50),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
    },
    async ({ search, against_type, against_id, limit, page, fetch_all }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'name',
      };
      if (search) params['_search'] = search;
      if (against_type && against_id) {
        const filters = buildFilters({ against: `${against_type}(${against_id})` });
        if (filters) params['_filters'] = filters;
      }

      const result = await listAcceloCollection(client, {
        path: '/tags',
        params,
        fetchAll: fetch_all,
      });
      const tags = result.items;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            tags: tags.map(t => ({
              id: t.id,
              name: t.name,
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
    'list_groups',
    'List staff groups in Accelo.',
    {
      staff_id: idParam.optional().describe('Filter to groups this staff member belongs to'),
      search: z.string().optional().describe('Search by group title'),
      limit: z.number().int().min(1).max(100).optional().default(100),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
    },
    async ({ staff_id, search, limit, page, fetch_all }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'title,standing,parent_id',
      };
      if (search) params['_search'] = search;
      if (staff_id) {
        const filters = buildFilters({ staff_id });
        if (filters) params['_filters'] = filters;
      }

      const result = await listAcceloCollection(client, {
        path: '/groups',
        params,
        fetchAll: fetch_all,
      });
      const groups = result.items;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            groups: groups.map(g => ({
              id: g.id,
              title: g.title,
              standing: g.standing,
              parent_id: g.parent_id,
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
    'list_expenses',
    'List expenses in Accelo. Tracks costs incurred against jobs, issues, or contracts.',
    {
      against_type: z.enum(['job', 'issue', 'contract_period']).optional().describe('Filter by what the expense is against'),
      against_id: idParam.optional().describe('ID of the object'),
      limit: z.number().int().min(1).max(100).optional().default(20),
      page: z.number().int().min(0).optional().default(0),
      fetch_all: z.boolean().optional().default(false).describe('Fetch all matching records across pages'),
      fields: z.string().optional().describe('Fields to request from Accelo. Defaults to "_ALL".'),
    },
    async ({ against_type, against_id, limit, page, fetch_all, fields }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': resolveAcceloFields(fields),
      };
      const filters = buildFilters({
        ...(against_type ? { against_type } : {}),
        ...(against_id ? { against_id } : {}),
      });
      if (filters) params['_filters'] = filters;

      const result = await listAcceloCollection(client, {
        path: '/expenses',
        params,
        fetchAll: fetch_all,
      });
      const expenses = result.items;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            expenses: expenses.map(e => ({
              ...withAcceloAliases(e, {
                type_id: ['expense_type', 'type'],
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

  server.tool(
    'list_profile_fields',
    'List custom/profile fields available for a given entity type. Returns field names, types, and options.',
    {
      entity: z.enum(ENTITY_TYPES).describe('The entity type to list profile fields for'),
      limit: z.number().int().min(1).max(1000).optional().default(250),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ entity, limit, page }) => {
      const { data } = await client.get(`/${entity}/profiles/fields`, {
        '_limit': limit,
        '_page': page,
      });
      const fields = normalizeAcceloList(data);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            entity,
            profile_fields: fields.map(f => ({
              id: f.id,
              field_name: f.field_name,
              field_type: f.field_type,
              required: f.required,
              options: f.options,
              link_type: f.link_type,
            })),
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'list_profile_values',
    'List custom/profile field values. Can get values for a specific object or all values across an entity type.',
    {
      entity: z.enum(ENTITY_TYPES).describe('The entity type'),
      object_id: idParam.optional().describe('Specific object ID to get profile values for (omit for all)'),
      limit: z.number().int().min(1).max(1000).optional().default(250),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ entity, object_id, limit, page }) => {
      const path = object_id
        ? `/${entity}/${object_id}/profiles/values`
        : `/${entity}/profiles/values`;

      const { data } = await client.get(path, {
        '_limit': limit,
        '_page': page,
      });
      const values = normalizeAcceloList(data);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            entity,
            ...(object_id ? { object_id } : {}),
            profile_values: values.map(v => ({
              id: v.id,
              field_id: v.field_id,
              field_name: v.field_name,
              field_type: v.field_type,
              value: v.value,
              values: v.values,
              link_type: v.link_type,
              link_id: v.link_id,
            })),
          }, null, 2),
        }],
      };
    }
  );
  server.tool(
    'list_extension_fields',
    'List extension/custom fields for entities whose field sets vary by type, such as jobs, issues, contracts, and prospects.',
    {
      entity: z.enum(EXTENSION_ENTITY_TYPES).describe('The entity type to list extension fields for'),
      limit: z.number().int().min(1).max(1000).optional().default(250),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ entity, limit, page }) => {
      const { data } = await client.get(`/${entity}/extensions/fields`, {
        '_limit': limit,
        '_page': page,
      });
      const fields = normalizeAcceloList(data);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            entity,
            extension_fields: fields,
          }, null, 2),
        }],
      };
    }
  );
  server.tool(
    'list_extension_values',
    'List extension/custom field values. Can get values for a specific object or all values across an entity type.',
    {
      entity: z.enum(EXTENSION_ENTITY_TYPES).describe('The entity type'),
      object_id: idParam.optional().describe('Specific object ID to get extension values for (omit for all)'),
      limit: z.number().int().min(1).max(1000).optional().default(250),
      page: z.number().int().min(0).optional().default(0),
    },
    async ({ entity, object_id, limit, page }) => {
      const path = object_id
        ? `/${entity}/${object_id}/extensions/values`
        : `/${entity}/extensions/values`;

      const { data } = await client.get(path, {
        '_limit': limit,
        '_page': page,
      });
      const values = normalizeAcceloList(data);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            entity,
            ...(object_id ? { object_id } : {}),
            extension_values: values,
          }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerLookupTools };
