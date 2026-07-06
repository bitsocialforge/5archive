# 5archive

The permanent public archive and search engine for [5chan](https://5chan.app)
boards — **[5archive.org](https://5archive.org)**, a
[Bitsocial Forge](https://bitsocialforge.com) product.

5chan purges archived threads 48 hours after archival. 5archive crawls every
5chan board continuously, so threads that vanish upstream stay readable — and
searchable — here forever. Server-rendered pages give 5chan content what the
network itself can't: SEO and permanence.

5chan embeds this instance's API to power in-app search (a `/search/` board).

This is a **thin, private deployment repo**: config, the board list, and deploy
docs. The actual software is the open
[`bitsocial-indexer`](https://github.com/bitsocialnet/bitsocial-indexer) engine
(GPL-3.0-or-later), built and deployed directly from its public repo — no
engine code is forked or vendored here.

> **Why is this repo closed source?** The engine's GPL is copyleft on
> *distribution*, not on running a service, so a branded private instance is
> fine — the same model as Etherscan on open Ethereum. This repo stays private
> because it's deployment config, not software. v1 runs **no ads**; ads may be
> considered later.

## Architecture

Two deployments, one engine:

```
        Bitsocial network (IPFS / IPNS / pubsub)
                     │
     5chan bitsocial-cli daemon (PKC RPC, ws://localhost:9138)
                     │
 ┌───────────────────────────────────────────┐
 │ VPS 91.234.199.189 — this repo            │
 │   bitsocial-indexer `server` (Docker)     │
 │   crawler ─▶ SQLite+FTS5 ─▶ Fastify API   │
 │   Caddy ─▶ https://api.5archive.org       │
 └───────────────────┬───────────────────────┘
                     │  REST + search API (CORS-restricted)
 ┌───────────────────┴───────────────────────┐
 │ Vercel — engine's `webui/` (Next.js SSR)  │
 │   https://5archive.org                    │
 └───────────────────────────────────────────┘
   + 5chan's in-app /search/ board calls the API directly
```

- **API + crawler** run on the same VPS as the 5chan daemon they crawl, so the
  PKC RPC secret never leaves the host.
- **Web UI** is the engine's `webui/` deployed to Vercel, pointed at the API
  via `INDEXER_API`.

## What's in this repo

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Builds the engine's `server` from GitHub, 5archive config via env |
| `config/communities.json` | The 5chan boards to index (generated, don't hand-edit) |
| `scripts/build-communities.mjs` | Regenerates the board list from [`bitsocialnet/lists`](https://github.com/bitsocialnet/lists) |
| `.env.example` | Documents every env var; real `.env` lives only on the VPS |
| `DEPLOY.md` | Full runbook: VPS, Caddy, Cloudflare DNS, Vercel |

## Setup

See **[DEPLOY.md](DEPLOY.md)** for the complete runbook. The short version:

```bash
# Generate the 5chan board list
node scripts/build-communities.mjs      # writes config/communities.json

# VPS (api.5archive.org): scp this repo to /opt/5archive, create .env, then
docker compose up -d --build

# Web UI (5archive.org): deploy the engine's webui/ to Vercel
```

## Maintenance

- **Refresh the board list** when 5chan directories change:
  `node scripts/build-communities.mjs`, scp `config/` to the VPS, then
  `docker compose restart server`.
- **Update the engine:** `docker compose build --no-cache && docker compose up -d`
  (rebuilds from the latest `bitsocial-indexer` master). For the web UI,
  redeploy on Vercel.

## TODO (later)

- 5chan imageboard skin — the engine's webui currently exposes only
  `SITE_NAME`/`SITE_BADGE`; theme + brand-line vars are pending upstream.
- Maybe ads (explicitly out of scope for v1).

## License

Proprietary / all rights reserved. Not for redistribution.
(The engine itself is GPL-3.0-or-later at
[bitsocialnet/bitsocial-indexer](https://github.com/bitsocialnet/bitsocial-indexer).)
