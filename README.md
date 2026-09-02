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
(GPL-3.0-or-later) — that part is **not** forked; Docker pulls its published
image, pinned to a release tag.

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
| `docker-compose.yml` | Runs the engine's `server` from a pinned GHCR image, 5archive config via env |
| `config/communities.json` | The 5chan boards to index (generated, don't hand-edit) |
| `webui/lib/directories.json` | Directory code → boards + title, the web UI's URL map (generated, don't hand-edit) |
| `config/blocklist.json` | Takedown blocklist — CIDs redacted from the archive (see below) |
| `config/nsfw-overrides.json` | Operator NSFW overrides — per-board verdicts that outrank every other NSFW signal (see `DEPLOY.md`) |
| `scripts/build-communities.mjs` | Regenerates both generated files from [`bitsocialnet/lists`](https://github.com/bitsocialnet/lists) |
| `.env.example` | Documents every env var; real `.env` lives only on the VPS |
| `DEPLOY.md` | Full runbook: VPS, Caddy, Cloudflare DNS, Vercel |

## URL scheme

5archive addresses content the way 5chan does — by **directory code**, not by
board address:

| URL | Page |
|-----|------|
| `5archive.org/biz` | Every archived thread under the `/biz/` directory |
| `5archive.org/biz/thread/<cid>` | A thread; a reply's cid redirects to its thread, anchored (`#p<cid>`) |

Several boards can compete for one directory code (the highest-scoring one
resolves it on 5chan, and 5chan rotates to the next if it goes offline), so the
directory page merges every candidate board's threads and a thread URL survives
rotations. The code → boards map is `webui/lib/directories.json`, generated from
[`bitsocialnet/lists`](https://github.com/bitsocialnet/lists).

The pre-directory URLs (`/p/<address>`, `/c/<cid>`) permanently redirect to the
new ones. A board that upstream drops from the directory lists while its threads
stay archived is served under its address (`5archive.org/<address>`), so nothing
indexed becomes unreachable.

## Sending readers to 5chan

Search traffic lands on 5archive rather than 5chan, because 5chan is a
client-rendered SPA whose threads can't rank. The archive's job is to catch that
traffic and hand it on — but it can only do that by staying a real page.
Redirecting search visitors to 5chan would hand the ranking back to a page
Google can't read, and redirecting only humans is cloaking. So the way out is
links, not redirects, and they are calibrated to whether the thread still exists
upstream (`webui/lib/upstream.ts`, `webui/components/Upstream.tsx`):

| Thread state | Reader is offered |
|--------------|-------------------|
| Live upstream (`archived = 0`) | The thread itself — beside the heading, and as the call to action after the last reply, which also offers the board as a fallback |
| Purged (`archived = 1`) | Its board. 5chan drops threads 48h after archiving them, and a dead thread on a p2p network hangs rather than 404s, so thread links are never offered |

Every page also carries a link to 5chan in the sticky header — the one that
can't rot, and the only one a reader who never reaches the bottom of a long
thread will see — plus a provenance line under the opening post naming where
the thread came from and when it was archived.

Three rules matter when touching this:

- **Link boards by address, never by directory code.** Codes are contested —
  several boards compete for `/biz/` and the winner rotates — so `#/biz` can
  resolve to a different board than the thread was archived from. Only the
  directory page itself, whose subject *is* the code, links by code.
- **Keep the links plain and followed.** They point at a sibling first-party
  site; `nofollow` and `noreferrer` are both wrong here (the second would hide
  from 5chan that the archive is what sent the reader).
- **Don't add a link per reply.** 5chan resolves any reply cid to its root
  thread, and because its routes live in the URL fragment, search engines
  collapse every such link to the same `5chan.app` URL — a hundred replies
  would mean a hundred identical outbound links. Only the reply a permalink
  actually targets gets one.

Thread pages also carry `DiscussionForumPosting` JSON-LD (`webui/lib/jsonld.ts`)
describing the OP and every rendered reply. It only ever describes what the page
displays: no upstream URLs, no images the archive doesn't render, and redacted
replies quote the same placeholder the reader sees.

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
| `yarn communities:build` | Regenerates `config/communities.json` + `webui/lib/directories.json` |

The first portless run asks for sudo once to bind port 443 and trust its local
CA. On a branch other than `master` the URL becomes
`https://<branch>.5archive.localhost`, so several checkouts can run at the same
time. `PORTLESS=0 yarn start` skips portless and serves
`http://localhost:3000` instead (also the automatic Windows fallback).

Git worktrees count as separate checkouts: run `yarn install` once inside a new
one (yarn refuses to run scripts otherwise), then `yarn start` there serves that
worktree's branch on its own `https://<branch>.5archive.localhost` host. If a
worktree predates this workflow it has no `package.json`, so yarn would walk up
and start the primary checkout instead — `yarn start` stops with instructions
rather than serving the wrong branch.

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
# Generate the 5chan board list and the directory-code URL map
node scripts/build-communities.mjs      # config/communities.json + webui/lib/directories.json

# VPS (api.5archive.org): scp docker-compose.yml and config/ to /opt/5archive,
# create .env, then pull the pinned engine image and start it
docker compose pull && docker compose up -d

# Web UI (5archive.org): deploy this repo's webui/ to Vercel
cd webui && vercel deploy --prod --yes
```

## Maintenance

- **Refresh the board list** when 5chan directories change:
  `node scripts/build-communities.mjs`, scp `config/` to the VPS, then
  `docker compose restart server`. The same run updates
  `webui/lib/directories.json` — commit it and redeploy the web UI so new or
  rotated directory codes resolve.
- **Update the engine (API/crawler):** bump the `image:` tag in
  `docker-compose.yml` to the `bitsocial-indexer` release you want, scp the
  file to the VPS, then `docker compose pull && docker compose up -d`. The tag
  is pinned, so nothing moves until you change it.
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
