# accelo-mcp

Read-only Accelo connector for Claude. Exposes 15 tools covering companies, contacts, projects, tickets, retainers, activities, time entries, prospects, staff, and invoices.

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
| `list_projects` | List projects, filter by status/company |
| `get_project` | Full project details |
| `list_project_tasks` | Tasks/milestones for a project |
| `list_issues` | List tickets, filter by status/assignee |
| `get_issue` | Full ticket details |
| `list_retainers` | List retainer contracts |
| `get_retainer` | Full retainer details |
| `list_requests` | List service requests |
| `get_request` | Full request details |
| `list_activities` | Activities (emails, calls, notes) |
| `list_time_entries` | Time entries by staff/project/date |
| `list_prospects` | Sales prospects/opportunities |
| `list_staff` | Staff members |
| `list_invoices` | Invoices by company/status |

All tools are **read-only** — no POST/PUT/DELETE calls are made.
