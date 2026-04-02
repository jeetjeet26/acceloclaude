'use strict';

const DEFAULT_FIELDS = '_ALL';

const PROFILE_VALUE_ENTITIES = new Set([
  'affiliations',
  'companies',
  'contacts',
  'contracts',
  'contributors',
  'expenses',
  'invoices',
  'issues',
  'jobs',
  'milestones',
  'prospects',
  'purchases',
  'staff',
]);

const EXTENSION_VALUE_ENTITIES = new Set([
  'assets',
  'contracts',
  'issues',
  'jobs',
  'prospects',
]);

function normalizeAcceloList(data) {
  if (Array.isArray(data)) {
    return data;
  }

  return data ? [data] : [];
}

function resolveAcceloFields(fields, fallback = DEFAULT_FIELDS) {
  return typeof fields === 'string' && fields.trim() ? fields.trim() : fallback;
}

function extractAcceloId(value) {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'object') {
    return value.id ?? value.value ?? null;
  }

  if (typeof value === 'string' && value.includes('/')) {
    return value.split('/').filter(Boolean).pop() || value;
  }

  return value;
}

function withAcceloAliases(record, aliasMap = {}) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const aliases = {};

  for (const [alias, sourceKeys] of Object.entries(aliasMap)) {
    const keys = Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys];

    for (const key of keys) {
      if (record[key] !== undefined) {
        aliases[alias] = extractAcceloId(record[key]);
        break;
      }
    }
  }

  return {
    ...record,
    ...aliases,
  };
}

async function attachAcceloCustomFields(
  client,
  {
    entity,
    objectId,
    record,
    includeProfileValues = false,
    includeExtensionValues = false,
  }
) {
  if (!record || !objectId) {
    return record;
  }

  const enriched = { ...record };
  const warnings = [];
  const tasks = [];

  if (includeProfileValues && PROFILE_VALUE_ENTITIES.has(entity)) {
    tasks.push(
      client.get(`/${entity}/${objectId}/profiles/values`, { '_limit': 1000 })
        .then(({ data }) => {
          enriched.profile_values = normalizeAcceloList(data);
        })
        .catch((err) => {
          warnings.push(`Failed to load profile values for ${entity}/${objectId}: ${err.message}`);
        })
    );
  }

  if (includeExtensionValues && EXTENSION_VALUE_ENTITIES.has(entity)) {
    tasks.push(
      client.get(`/${entity}/${objectId}/extensions/values`, { '_limit': 1000 })
        .then(({ data }) => {
          enriched.extension_values = normalizeAcceloList(data);
        })
        .catch((err) => {
          warnings.push(`Failed to load extension values for ${entity}/${objectId}: ${err.message}`);
        })
    );
  }

  if (tasks.length) {
    await Promise.all(tasks);
  }

  if (warnings.length) {
    enriched.custom_field_warnings = warnings;
  }

  return enriched;
}

module.exports = {
  DEFAULT_FIELDS,
  attachAcceloCustomFields,
  extractAcceloId,
  normalizeAcceloList,
  resolveAcceloFields,
  withAcceloAliases,
};
