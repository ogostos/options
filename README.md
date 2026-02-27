# Personal Options Trading Dashboard

Private single-user trading dashboard built with Next.js App Router and designed to match the reference dark dashboard UI.

## Stack

- Next.js 15 (App Router)
- Tailwind CSS (enabled) + inline styles for exact visual matching
- Vercel Postgres (`@vercel/postgres`) for persistence
- `pdf-parse` for Interactive Brokers activity statement imports

## Core Features

- Dashboard tabs:
  - `📊 Account`
  - `⚡ Live Positions`
  - `📋 History`
  - `🔬 Analysis`
- Add/Edit trade forms:
  - `/trades/new`
  - `/trades/[id]/edit`
- PDF import + preview + merge:
  - `/import`
- Settings and data admin:
  - `/settings`
  - JSON export backup
  - reset + reseed
- Live price proxy API:
  - `/api/prices` (Massive primary + Yahoo fallback)

## Environment Variables

Copy `.env.example` and set:

```bash
DATABASE_URL=postgresql://...
MASSIVE_API_KEY=... # optional, primary source for stocks + options
MASSIVE_API_BASE_URL=https://api.massive.com # optional override
IBKR_SYNC_TOKEN=... # optional, required for local IBKR panel -> app sync endpoint
```

## Local Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## IBKR Local Sync Panel

Run a local control panel that wraps CPGW startup, auth checks, preview fetch, and explicit sync-to-DB:

```bash
npm run ibkr:panel
```

Default panel URL: `http://localhost:8913`

Expected local env variables for the panel process:

- `IBKR_CPGW_BIN_DIR` (default: `/Users/kmarkosyan/Downloads/clientportal.gw/bin`)
- `IBKR_CPGW_CONF` (optional override)
- `IBKR_CPGW_BASE_URL` (default: `https://localhost:5000/v1/api`)
- `IBKR_ACCOUNT_ID` (default: `U18542108`)
- `IBKR_PANEL_PORT` (default: `8913`)
- `IBKR_APP_SYNC_URL` (example: `https://<your-vercel-app>/api/ibkr-sync`)
- `IBKR_SYNC_TOKEN` (must match app env `IBKR_SYNC_TOKEN`)

## Deploy (Vercel)

```bash
vercel --prod
```

`vercel.json` is included and sets a longer function duration for PDF import.

## Database + Seed

Schema creation and seed population are automatic in `lib/db.ts` on first run:

- `account_snapshots`
- `trades`
- `rules`
- `journal_entries`
- `settings`
- `stock_positions`

Seed includes:

- 1 account snapshot
- 15 closed options trades
- 5 open options positions
- 2 stock positions
- 10 discipline rules
- starter journal entries
