'use strict';

require('dotenv').config();

const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { randomUUID } = require('crypto');

const { AcceloClient } = require('./services/accelo-client.js');
const { registerCompanyTools } = require('./tools/companies.js');
const { registerProjectTools } = require('./tools/projects.js');
const { registerRequestTools } = require('./tools/requests.js');
const { registerActivityTools } = require('./tools/activities.js');
const { registerSalesTools, registerStaffTools } = require('./tools/sales-staff.js');
const { registerIssueTools, registerRetainerTools } = require('./tools/issues-retainers.js');

// ── Config validation ─────────────────────────────────────────────────────────
const REQUIRED_VARS = ['ACCELO_DEPLOYMENT', 'ACCELO_CLIENT_ID', 'ACCELO_CLIENT_SECRET'];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your Accelo credentials.');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN; // optional bearer token to protect this server

// ── Accelo client ─────────────────────────────────────────────────────────────
const acceloClient = new AcceloClient({
  deployment: process.env.ACCELO_DEPLOYMENT,
  clientId: process.env.ACCELO_CLIENT_ID,
  clientSecret: process.env.ACCELO_CLIENT_SECRET,
});

// ── Session store (stateful transport) ───────────────────────────────────────
const sessions = new Map();

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

const BASE_URL = process.env.BASE_URL || `https://p11-accelo-mcp-9c30e120505f.herokuapp.com`;

// Optional: protect the MCP endpoint with a bearer token
function authMiddleware(req, res, next) {
  if (!MCP_AUTH_TOKEN) return next();

  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (token !== MCP_AUTH_TOKEN) {
    res.set(
      'WWW-Authenticate',
      `Bearer realm="${BASE_URL}", resource="${BASE_URL}/mcp"`
    );
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing bearer token' });
  }
  next();
}

// OAuth 2.0 Protected Resource Metadata (RFC 9728 / MCP auth spec)
const oauthResourceMetadata = {
  resource: `${BASE_URL}/mcp`,
  authorization_servers: [],
  bearer_methods_supported: ['header'],
  resource_documentation: `${BASE_URL}/health`,
};

app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json(oauthResourceMetadata);
});

app.get('/.well-known/oauth-protected-resource/mcp', (req, res) => {
  res.json(oauthResourceMetadata);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accelo-mcp', deployment: process.env.ACCELO_DEPLOYMENT });
});

// MCP endpoint
app.all('/mcp', authMiddleware, async (req, res) => {
  try {
    // Reuse session if session ID header present
    const sessionId = req.headers['mcp-session-id'];
    let transport;

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
        // Clean up after 2 hours of inactivity
        setTimeout(() => sessions.delete(id), 2 * 60 * 60 * 1000);
      },
    });

    const server = buildMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }
});

// ── Build MCP server with all tools ──────────────────────────────────────────
function buildMcpServer() {
  const server = new McpServer({
    name: 'accelo-mcp',
    version: '1.0.0',
  });

  // Register all read-only tool groups
  registerCompanyTools(server, acceloClient);
  registerProjectTools(server, acceloClient);
  registerRequestTools(server, acceloClient);
  registerActivityTools(server, acceloClient);
  registerSalesTools(server, acceloClient);
  registerStaffTools(server, acceloClient);
  registerIssueTools(server, acceloClient);
  registerRetainerTools(server, acceloClient);

  return server;
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Accelo MCP server running on port ${PORT}`);
  console.log(`   Deployment: ${process.env.ACCELO_DEPLOYMENT}.accelo.com`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  if (MCP_AUTH_TOKEN) {
    console.log('   Auth: Bearer token enabled');
  } else {
    console.log('   Auth: No token set (set MCP_AUTH_TOKEN to secure)');
  }
  console.log('\n   Available tools:');
  console.log('   - list_companies, get_company, list_contacts, create_company, add_company_manager');
  console.log('   - list_projects, get_project, list_project_tasks, create_job, create_task');
  console.log('   - list_issues, get_issue, create_issue');
  console.log('   - list_retainers, get_retainer');
  console.log('   - list_requests, get_request');
  console.log('   - list_activities, list_time_entries, get_time_allocations');
  console.log('   - list_prospects, list_staff, list_invoices\n');
});
