# Company Folder Structure

```
company/
├── HANDBOOK.md          # Company rules (150 lines max)
├── sales/
│   ├── README.md        # Inputs/Outputs for Sales agent
│   └── leads.md         # Generated leads
├── marketing/
│   ├── README.md        # Inputs/Outputs for Marketing agent
│   └── posts.md         # Generated posts
├── support/
│   ├── README.md        # Inputs/Outputs for Support agent
│   └── drafts/          # Draft replies
├── finance/
│   ├── README.md        # Inputs/Outputs for Finance agent
│   └── report.md        # Generated reports
├── ops/
│   ├── README.md        # Inputs/Outputs for Ops agent
│   └── daily-plan.md    # Daily plan
├── research/
│   ├── README.md        # Inputs/Outputs for Research agent
│   └── findings.md      # Research findings
└── shared/
    ├── README.md        # Shared data documentation
    ├── icp.md           # Ideal Customer Profile
    ├── niche.md         # Target niche
    ├── leads.md         # Shared leads
    ├── posts.md         # Shared posts
    ├── report.md        # Shared report
    ├── daily-plan.md    # Shared daily plan
    ├── findings.md      # Shared findings
    ├── tasks.json       # Task queue
    ├── topics.md        # Research topics
    └── support-summary.md # Support status
```

## Folder Locking (Sandbox)

Each agent is locked to its own folder:
- Sales agent → `company/sales/` + `shared/` (read-only for shared)
- Marketing agent → `company/marketing/` + `shared/` (read-only for shared)
- Support agent → `company/support/` + `shared/` (read-only for shared)
- Finance agent → `company/finance/` + `shared/` (read-only for shared)
- Ops agent → `company/ops/` + `shared/` (read-only for shared)
- Research agent → `company/research/` + `shared/` (read-only for shared)

## MCP Integration

Configure MCP servers in `.mcp.json` (copy from `.mcp.json.example`):
- **Gmail**: Read emails, send follow-ups
- **Google Sheets**: Log leads, reports
- **Telegram**: Send morning summary
- **Make.com**: Trigger scenarios (Gmail + Sheets)

## Cron Trigger

Set up daily 8:00 AM trigger:
```powershell
powershell -File scripts/setup-cron.ps1
```

Or manually:
```powershell
schtasks /create /tn "AnimationOffice-Morning" /tr "node C:\path\to\scripts\cron-trigger.js" /sc daily /st 08:00
```
