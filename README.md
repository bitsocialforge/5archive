# 5archive

The permanent public archive and search engine for [5chan](https://5chan.app)
boards — **[5archive.org](https://5archive.org)**, a
[Bitsocial Forge](https://bitsocialforge.com) product.

5chan purges archived threads 48 hours after archival. 5archive crawls every
5chan board continuously, so threads that vanish upstream stay readable — and
searchable — here forever. Server-rendered pages give 5chan content what the
network itself can't: SEO and permanence.

5chan embeds this instance's API to power in-app search (a `/search/` board).

This is the **private repo for the full 5archive app**: the frontend
(`webui/`, a vendored fork of the engine's web UI) plus deploy config, the
board list, and deploy docs. The API/crawler is the open
[`bitsocial-indexer`](https://github.com/bitsocialnet/bitsocial-indexer) engine
(GPL-3.0-or-later) — that part is **not** forked; Docker builds it directly
from the public repo.

> **Why is this repo closed source?** The engine's GPL is copyleft on
> *distribution*, not on running a service, so a branded private instance is
> fine — the same model as Etherscan on open Ethereum. The vendored `webui/`
> is a private GPL fork that is never distributed, which the GPL permits.
> v1 runs **no ads**; ads may be considered later.

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
- `reason`: free-form operator note (kept private in this repo — it is not
  served publicly).

### Operator workflow

1. Edit `config/blocklist.json` in this repo (keep it valid JSON) and commit.
2. Copy it to the VPS per [DEPLOY.md](DEPLOY.md):
   `scp config/blocklist.json root@91.234.199.189:/opt/5archive/config/`
3. Done — the engine watches the file and redacts (tombstones) the listed
   content within about a minute. **No restart needed.**

Removing an entry and re-copying the file restores the content the same way.

## TODO (later)

- 5chan imageboard skin — now that the webui is forked into this repo,
  5archive-specific theming can be built directly in `webui/`.
- Maybe ads (explicitly out of scope for v1).

## License

Proprietary / all rights reserved. Not for redistribution. Exception:
`webui/` is a private fork of GPL-3.0-or-later code and remains under that
license (it is simply not distributed). The engine itself is GPL-3.0-or-later
at
[bitsocialnet/bitsocial-indexer](https://github.com/bitsocialnet/bitsocial-indexer).
