# 5archive

The permanent public archive and search engine for [5chan](https://5chan.app)
boards — **[5archive.org](https://5archive.org)**, a
[Bitsocial Forge](https://bitsocialforge.com) product.

5chan purges archived threads 48 hours after archival. 5archive crawls every
5chan board continuously, so threads that vanish upstream stay readable — and
searchable — here forever. Server-rendered pages give 5chan content what the
network itself can't: SEO and permanence.

5chan embeds this instance's API to power in-app search (a `/search/` board).

This is the public source repository for the full 5archive app: the frontend
(`webui/`, a vendored fork of the engine's web UI) plus deploy config, the
board list, and deploy docs. The API/crawler is the open
[`bitsocial-indexer`](https://github.com/bitsocialnet/bitsocial-indexer) engine
(GPL-3.0-or-later) — that part is **not** forked; Docker builds it directly
from the public repo.

## Open source, centralized service

5archive is centralized in operation: Bitsocial Forge runs the crawler, index,
API, and public website. Its source is open because the archive is
infrastructure for the Bitsocial ecosystem, not a proprietary data moat. The
GPL-licensed code and reproducible configuration make it easier to launch
independent mirrors, forks, alternative frontends, and related side projects.

That is the useful role of Bitsocial Forge here: run dependable centralized
infrastructure where it helps, while publishing the implementation so others
can reproduce and extend it. In the Forge's words: **accelerate Bitsocial**.

## Architecture

Two deployments:

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
 │ Vercel — this repo's `webui/` (Next.js    │
 │   SSR, vendored fork of the engine webui) │
 │   https://5archive.org                    │
 └───────────────────────────────────────────┘
   + 5chan's in-app /search/ board calls the API directly
```

- **API + crawler** run on the same VPS as the 5chan daemon and use its
  local-only PKC RPC endpoint; the daemon's remote auth key is not stored here.
- **Web UI** is this repo's `webui/` — a vendored fork of the engine's webui
  (taken at v0.2.0; upstream improvements ported manually) — deployed to
  Vercel and pointed at the API via `INDEXER_API`. 5archive-specific UI work
  happens here, not upstream.

## What's in this repo

| Path | Purpose |
|------|---------|
| `webui/` | The 5archive frontend — vendored fork of the engine's `webui/` (see `webui/README.md` for provenance) |
| `docker-compose.yml` | Builds the engine's `server` from GitHub, 5archive config via env |
| `config/communities.json` | The 5chan boards to index (generated, don't hand-edit) |
| `config/blocklist.json` | Takedown blocklist — CIDs redacted from the archive (see below) |
| `scripts/build-communities.mjs` | Regenerates the board list from [`bitsocialnet/lists`](https://github.com/bitsocialnet/lists) |
| `.env.example` | Documents every env var; real `.env` lives only on the VPS |
| `DEPLOY.md` | Full runbook: VPS, Caddy, Cloudflare DNS, Vercel |

## Local development

Same workflow as the other Bitsocial clients (5chan, seedit): one `yarn start`
runs the web UI on a stable named URL through
[portless](https://www.npmjs.com/package/portless) — no port numbers to
remember, and the browser opens by itself.

```bash
corepack yarn install     # root dev tooling, and webui/ deps via npm
corepack yarn start       # https://5archive.localhost
```

| Command | What it does |
|---|---|
| `yarn start` | Next.js dev server (HMR) at `https://5archive.localhost` |
| `yarn start:preview` | Production build of `webui/`, served at the same URL |
| `yarn build` | `next build` in `webui/` |
| `yarn type-check` | `tsc --noEmit` in `webui/` |
| `yarn communities:build` | Regenerates `config/communities.json` |

The first portless run asks for sudo once to bind port 443 and trust its local
CA. On a branch other than `master` the URL becomes
`https://<branch>.5archive.localhost`, so several checkouts can run at the same
time. `PORTLESS=0 yarn start` skips portless and serves
`http://localhost:3000` instead (also the automatic Windows fallback).

Dev defaults live in `webui/.env.development`: the local UI reads the public
production API (`https://api.5archive.org`), so `yarn start` shows the real
archive without running a crawler. Override anything in `webui/.env.local`
(gitignored) — e.g. `INDEXER_API=http://localhost:4000` to develop against a
local indexer from `docker-compose.yml`.

`webui/` keeps its own npm lockfile because Vercel deploys that directory as
the project root; the root yarn project owns only the dev workflow and installs
`webui/` for you.

## Setup

See **[DEPLOY.md](DEPLOY.md)** for the complete runbook. The short version:

```bash
# Generate the 5chan board list
node scripts/build-communities.mjs      # writes config/communities.json

# VPS (api.5archive.org): scp this repo to /opt/5archive, create .env, then
docker compose up -d --build

# Web UI (5archive.org): deploy this repo's webui/ to Vercel
cd webui && vercel deploy --prod --yes
```

## Maintenance

- **Refresh the board list** when 5chan directories change:
  `node scripts/build-communities.mjs`, scp `config/` to the VPS, then
  `docker compose restart server`.
- **Update the engine (API/crawler):** `docker compose build --no-cache &&
  docker compose up -d` (rebuilds from the latest `bitsocial-indexer` master).
- **Update the web UI:** edit `webui/` in this repo, then
  `vercel deploy --prod` from `webui/`. Upstream engine-webui improvements are
  ported into `webui/` manually.

## Takedowns / content policy

5archive is a mirror of already-moderated content, plus an operator-level
takedown mechanism on top:

- **Only moderated boards are indexed.** 5archive crawls the 5chan directory
  boards listed in `config/communities.json` — communities that are actively
  moderated upstream.
- **Mod-queue content is never indexed.** Posts pending approval
  (`pendingApproval`) on a board never enter the archive; only content the
  board's moderators have let through gets crawled.
- **Upstream removals are inherited.** When 5chan moderators remove a comment
  or thread, the archive tombstones it on the next crawl rather than keeping
  the removed content readable.
- **Takedown requests are honored via the blocklist.** Content that must be
  removed from the archive itself (legal takedowns, abuse reports) is redacted
  by adding its CID to `config/blocklist.json`. The takedown contact and
  instructions are published on the site's `/legal` page (rendered from the
  webui's `CONTACT_EMAIL` env, linked in the footer).

### Blocklist format

`config/blocklist.json` must stay a **valid JSON array** (no comments). Each
entry is either a bare CID string or an object:

```json
[
  "QmExampleBareCid…",
  { "cid": "QmExampleCid…", "scope": "comment", "reason": "DMCA 2026-07-06" },
  { "cid": "QmExampleCid…", "scope": "thread", "reason": "court order" }
]
```

- `scope`: `"comment"` (just that post) or `"thread"` (the whole thread under
  it). A bare string means comment scope.
- `reason`: free-form public operator note. This repository is public, so do
  not include personal information or other sensitive material.

### Operator workflow

1. Edit `config/blocklist.json` in this repo (keep it valid JSON) and commit.
2. Copy it to the VPS per [DEPLOY.md](DEPLOY.md):
   `scp config/blocklist.json root@91.234.199.189:/opt/5archive/config/`
3. Done — the engine watches the file and redacts (tombstones) the listed
   content within about a minute. **No restart needed.**

Removing an entry and re-copying the file restores the content the same way.

## Contributing and mirrors

Forks, mirrors, alternate frontends, additional search tools, and portability
improvements are welcome. The production instance remains operated by
Bitsocial Forge, while independent deployments choose their own crawl scope,
retention, moderation, takedown policy, infrastructure, and domain.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

The separately built indexer engine is also GPL-3.0-or-later at
[bitsocialnet/bitsocial-indexer](https://github.com/bitsocialnet/bitsocial-indexer).
