# accelo-mcp

Accelo connector for Claude with read and limited write support. It exposes tools covering companies, contacts, projects, tickets, retainers, activities, time entries, prospects, staff, and invoices.

Read tools now request Accelo's `_ALL` standard fields by default instead of hand-picked summaries, and single-record detail tools also surface profile/extension values where Accelo exposes them.

List tools now return authoritative pagination metadata where Accelo exposes `/count` endpoints:
- `total`: total matching records across all pages
- `returned`: records included in this response
- `has_more` / `next_page`: whether another page exists
- `fetch_all`: when true, the connector walks all pages and returns the full result set

If an Accelo `/count` endpoint is unavailable or fails, list tools now return `total: null` and `total_pages: null` instead of silently substituting the current page size.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure credentials
```bash
cp .env.example .env
```

Edit `.env`:
```
ACCELO_DEPLOYMENT=p11creativeinc
ACCELO_CLIENT_ID=80b038593f@p11creativeinc.accelo.com
ACCELO_CLIENT_SECRET=your-secret-here
PORT=3000

# Optional: protect the endpoint (recommended for public hosting)
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MCP_AUTH_TOKEN=
```

### 3. Run locally
```bash
npm start
# or for dev with auto-reload:
npm run dev
```

Server starts at `http://localhost:3000/mcp`

---

## Deploying (required for Claude to reach it)

Claude needs a **public HTTPS URL**. Easiest options:

### Option A: DigitalOcean App Platform (recommended)
1. Push this repo to GitHub
2. New App → connect repo → set environment variables in the UI
3. Gets you a public HTTPS URL automatically

### Option B: Cloudflare Tunnel (free, no port forwarding)
```bash
# Install cloudflared, then:
cloudflared tunnel --url http://localhost:3000
# Gives you a public https://xxx.trycloudflare.com URL
```
Good for testing. Not permanent — URL changes each time.

### Option C: Your existing DigitalOcean droplet
```bash
# On your droplet, clone the repo and run with PM2
pm2 start src/index.js --name accelo-mcp
# Set up nginx reverse proxy to port 3000
```

---

## Adding to Claude

1. Go to **Settings → Connectors → Add custom connector**
2. Name: `Accelo`
3. URL: `https://your-server.example.com/mcp`
4. If you set `MCP_AUTH_TOKEN`: Advanced Settings → enter token as Bearer token
5. Click Add

---

## Available Tools

| Tool | Description |
|------|-------------|
| `list_companies` | List/search client companies |
| `get_company` | Full company details by ID |
| `list_contacts` | List/search contacts, filter by company |
| `get_contact` | Full contact details by ID |
| `list_projects` | List projects, filter by status/company |
| `get_project` | Full project details |
| `create_job` | Create a new job/project |
| `update_job` | Update an existing job/project |
| `update_project` | Update an existing project via project-oriented naming |
| `list_project_tasks` | Tasks/milestones for a project |
| `create_task` | Create a new task |
| `update_task` | Update an existing task |
| `list_issues` | List tickets, filter by status/assignee |
| `get_issue` | Full ticket details |
| `list_retainers` | List retainer contracts |
| `get_retainer` | Full retainer details |
| `list_requests` | List service requests |
| `get_request` | Full request details |
| `list_activities` | Activities (emails, calls, notes) |
| `list_time_entries` | Time entries by staff/project/date |
| `list_prospects` | Sales prospects/opportunities |
| `get_prospect` | Full prospect details by ID |
| `list_staff` | Staff members |
| `list_invoices` | Invoices by company/status |
| `list_profile_fields` | List custom/profile field definitions |
| `list_profile_values` | List custom/profile field values |
| `list_extension_fields` | List extension field definitions |
| `list_extension_values` | List extension field values |

Write support currently includes creating companies, jobs, issues, and tasks, plus updating jobs and tasks. Delete operations are not exposed.
