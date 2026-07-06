# 5archive deployment runbook

Two deployments: the **API/crawler** on the VPS `91.234.199.189` (same host as
the 5chan `bitsocial-cli` daemon) and the **web UI** on Vercel. DNS on
Cloudflare.

Prereqs: SSH access to `root@91.234.199.189`, Cloudflare access for the
`5archive.org` zone, a Vercel account with the `vercel` CLI logged in.

---

## 1. VPS — API + crawler (api.5archive.org)

The VPS has **no GitHub credentials for private repos**, so this repo is copied
over with `scp`, not `git pull`. (The engine itself is public — Docker builds
it straight from GitHub on the VPS.)

```bash
# From this repo on your machine:
ssh root@91.234.199.189 'mkdir -p /opt/5archive'
scp docker-compose.yml root@91.234.199.189:/opt/5archive/
scp -r config root@91.234.199.189:/opt/5archive/
```

Create the env file **on the VPS** (the daemon auth token already lives there —
don't copy it through your machine):

```bash
ssh root@91.234.199.189
cat > /opt/5archive/.env <<'EOF'
PKC_RPC_URL=ws://localhost:9138/REPLACE_WITH_DAEMON_AUTH_TOKEN
SITE_URL=https://5archive.org
ALLOWED_ORIGINS=https://5archive.org
CRAWL_INTERVAL_MS=300000
CRAWL_MAX_PAGES=20
EOF
chmod 600 /opt/5archive/.env
```

The daemon auth token is the secret in the 5chan daemon's RPC URL on this host
(check the bitsocial-cli daemon's config/service on the VPS).

Build and start:

```bash
cd /opt/5archive
docker compose up -d --build
```

Verify:

```bash
docker compose logs -f server        # crawler should connect to the daemon
curl -s http://127.0.0.1:4000/api/health
```

Notes:

- The container uses **host networking** (`network_mode: host`) so
  `ws://localhost:9138` reaches the daemon on the host's loopback; the API
  itself binds `127.0.0.1:4000` only (`HOST=127.0.0.1`).
- The engine builds from its **`master`** branch (it has no `main`).
- SQLite data persists in the `5archive_data` Docker volume.

## 2. Caddy vhost (on the same VPS)

The host already runs Caddy for other sites — add one vhost to its Caddyfile:

```caddy
api.5archive.org {
	reverse_proxy 127.0.0.1:4000
}
```

Reload Caddy (whichever way it runs on this host):

```bash
systemctl reload caddy
# or, if Caddy runs as a container:
docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile
```

Caddy fetches the TLS cert automatically once the DNS record below exists
(the record must be DNS-only/grey-cloud so the ACME challenge reaches Caddy).

## 3. Cloudflare DNS (zone: 5archive.org)

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | `api` | `91.234.199.189` | **DNS only (grey cloud)** — Caddy does TLS |
| A | `@` | `76.76.21.21` | DNS only (standard Vercel apex) |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only |

## 4. Vercel — web UI (5archive.org)

The web UI is the engine's `webui/` directory, deployed as-is — no fork. Deploy
from a checkout of the public engine repo with the Vercel CLI:

```bash
git clone https://github.com/bitsocialnet/bitsocial-indexer.git
cd bitsocial-indexer/webui
vercel link          # create/select the "5archive" project (root = this dir)
```

Set the environment variables (production). These are the **actual names the
webui reads** (`webui/lib/api.ts`, `webui/lib/site.ts`):

| Var | Value | Meaning |
|-----|-------|---------|
| `INDEXER_API` | `https://api.5archive.org` | API base URL (SSR fetches) |
| `SITE_NAME` | `5archive` | Site name in header/titles |
| `SITE_BADGE` | *(empty string)* | No badge — title is just "5archive" |

```bash
vercel env add INDEXER_API production   # https://api.5archive.org
vercel env add SITE_NAME production     # 5archive
vercel env add SITE_BADGE production    # (empty)
```

> The current webui has **no** `THEME`, `BRAND_TEXT`, `BRAND_URL`, or
> `SITE_URL` env vars — don't set them; Vercel would just ignore them. Once the
> engine grows theme/brand-line support, add: `THEME=5chan`,
> `BRAND_TEXT="A Bitsocial Forge product"`,
> `BRAND_URL=https://bitsocialforge.com`. (`SITE_URL` is a server-side var,
> already set on the VPS.)

Deploy and attach the domains:

```bash
vercel deploy --prod
vercel domains add 5archive.org
vercel domains add www.5archive.org     # redirects to apex by default
```

Verify: `https://5archive.org` renders board list and search results (SSR —
view-source should contain post content), and browser calls to
`https://api.5archive.org` pass CORS.

## 5. Updates

| What changed | Do |
|--------------|----|
| Board list (5chan directories) | `node scripts/build-communities.mjs`, `scp -r config root@91.234.199.189:/opt/5archive/`, then `ssh root@91.234.199.189 'cd /opt/5archive && docker compose restart server'` |
| Engine (server) | On the VPS: `cd /opt/5archive && docker compose build --no-cache && docker compose up -d` |
| Engine (webui) | `git pull` in the engine checkout, `vercel deploy --prod` from `webui/` |
| This repo's compose/env conventions | `scp docker-compose.yml` to `/opt/5archive/` and `docker compose up -d` |
