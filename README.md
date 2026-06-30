# 5archive

Closed-source 5chan archiver and search engine — the deployment behind
**5archive.org**.

It is a thin, private wrapper around the open
[`bitsocial-indexer`](https://github.com/bitsocialnet/bitsocial-indexer) engine,
configured to index **only 5chan communities** and branded as 5archive. It
crawls 5chan boards from a [`bitsocial-cli`](https://github.com/bitsocialnet/bitsocial-cli)
daemon into SQLite and serves search + browse over a REST API and web UI.

5chan embeds this instance's API to power in-app search (a `/search/` board).

> **Why closed source?** The engine is GPL-3.0 (copyleft on *distribution*, not
> on running a service), so this monetised, ad-supported instance can stay
> private — the same model as Etherscan on open Ethereum. This repo holds only
> config, the community list, and (later) theme + ads; no engine code is forked.

## How it works

```
5chan bitsocial-cli daemon (PKC RPC :9138)
        │
   bitsocial-indexer engine  ← built from github.com/bitsocialnet/bitsocial-indexer
   (server + webui, via docker-compose git context)
        │  COMMUNITIES_SOURCE = config/communities.json (5chan boards only)
   Caddy → 5archive.org   +   5chan /search/ board hits /api
```

Nothing here forks the engine — `docker-compose.yml` builds it directly from the
public repo and overrides config via environment.

## Setup

```bash
# 1. Generate the 5chan community list from bitsocialnet/lists
node scripts/build-communities.mjs          # writes config/communities.json

# 2. Configure
cp .env.example .env                         # set PKC_RPC_URL (daemon + auth token)

# 3. Run (on the same host as the 5chan daemon)
docker compose up -d --build
```

Then point Caddy at `127.0.0.1:3000` (web UI) and proxy `/api` → `127.0.0.1:4000`
for `5archive.org`.

## Maintenance

- **Refresh the board list** when 5chan directories change:
  `node scripts/build-communities.mjs` then `docker compose restart server`.
- **Update the engine:** `docker compose build --no-cache && docker compose up -d`
  (rebuilds from the latest `bitsocial-indexer` main).

## TODO (later)

- 5chan imageboard skin (the engine ships the neutral bitsocial.net look; only
  `SITE_NAME` is overridden so far). Re-skin via the engine's theme tokens or a
  dedicated frontend on the API.
- Ad slots.

## License

Proprietary / all rights reserved. Not for redistribution.
