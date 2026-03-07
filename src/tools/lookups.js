'use strict';

const { z } = require('zod');

const idParam = z.union([z.string(), z.number()]).transform(String);
const ENTITY_TYPES = ['jobs', 'companies', 'contacts', 'contracts', 'issues', 'prospects', 'affiliations', 'milestones', 'invoices', 'staff', 'expenses', 'assets', 'contributors', 'purchases'];

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
    },
    async ({ search, against_type, against_id, limit }) => {
      const params = {
        '_limit': limit,
        '_fields': 'name',
      };
      if (search) params['_search'] = search;
      if (against_type && against_id) {
        const filters = buildFilters({ against: `${against_type}(${against_id})` });
        if (filters) params['_filters'] = filters;
      }

      const { data } = await client.get('/tags', params);
      const tags = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            tags: tags.map(t => ({
              id: t.id,
              name: t.name,
            })),
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
    },
    async ({ staff_id, search }) => {
      const params = {
        '_limit': 100,
        '_fields': 'title,standing,parent_id',
      };
      if (search) params['_search'] = search;
      if (staff_id) {
        const filters = buildFilters({ staff_id });
        if (filters) params['_filters'] = filters;
      }

      const { data } = await client.get('/groups', params);
      const groups = Array.isArray(data) ? data : (data ? [data] : []);

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
    },
    async ({ against_type, against_id, limit, page }) => {
      const params = {
        '_limit': limit,
        '_page': page,
        '_fields': 'title,against_type,against_id,quantity,unit_cost,total,billable,tax,date_incurred,type,standing',
      };
      const filters = buildFilters({
        ...(against_type ? { against_type } : {}),
        ...(against_id ? { against_id } : {}),
      });
      if (filters) params['_filters'] = filters;

      const { data, meta } = await client.get('/expenses', params);
      const expenses = Array.isArray(data) ? data : (data ? [data] : []);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            expenses: expenses.map(e => ({
              id: e.id,
              title: e.title,
              against_type: e.against_type,
              against_id: e.against_id,
              quantity: e.quantity,
              unit_cost: e.unit_cost,
              total: e.total,
              billable: e.billable,
              tax: e.tax,
              date_incurred: e.date_incurred,
              type: typeof e.type === 'object' ? e.type?.title : e.type,
              standing: e.standing,
            })),
            total: meta.more_info?.total_count || expenses.length,
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
    },
    async ({ entity }) => {
      const { data } = await client.get(`/${entity}/profiles/fields`, {
        '_limit': 100,
      });
      const fields = Array.isArray(data) ? data : (data ? [data] : []);

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
    },
    async ({ entity, object_id }) => {
      const path = object_id
        ? `/${entity}/${object_id}/profiles/values`
        : `/${entity}/profiles/values`;

      const { data } = await client.get(path, { '_limit': 100 });
      const values = Array.isArray(data) ? data : (data ? [data] : []);

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
}

module.exports = { registerLookupTools };
