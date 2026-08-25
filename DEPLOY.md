# 5archive deployment runbook

Two deployments: the **API/crawler** on the VPS `91.234.199.189` (same host as
the 5chan `bitsocial-cli` daemon) and the **web UI** on Vercel. DNS on
Cloudflare.

Prereqs: SSH access to `root@91.234.199.189`, Cloudflare access for the
`5archive.org` zone, a Vercel account with the `vercel` CLI logged in.

---

## 1. VPS — API + crawler (api.5archive.org)

The production checkout uses `scp` for its small operational surface; no
GitHub credential is required. The indexer engine is built directly from its
public GitHub repository by Docker.

```bash
# From this repo on your machine:
ssh root@91.234.199.189 'mkdir -p /opt/5archive'
scp docker-compose.yml root@91.234.199.189:/opt/5archive/
scp -r config root@91.234.199.189:/opt/5archive/
```

Create the env file **on the VPS**:

```bash
ssh root@91.234.199.189
cat > /opt/5archive/.env <<'EOF'
PKC_RPC_URL=ws://localhost:9138
SITE_URL=https://5archive.org
ALLOWED_ORIGINS=https://5archive.org,https://5chan.app,https://5chan.localhost
CRAWL_INTERVAL_MS=5000
CRAWL_CONCURRENCY=8
CRAWL_TIMEOUT_MS=30000
CRAWL_MAX_PAGES=20
EOF
chmod 600 /opt/5archive/.env
```

Because 5archive runs with host networking, `localhost` reaches the daemon as
a local connection. Do **not** copy the daemon's remote auth key into this env
file: it is unnecessary and dependency logs must never receive it.

Build and start:

```bash
cd /opt/5archive
docker compose up -d --build
```

Verify:

```bash
docker compose logs -f server        # crawler should connect to the daemon
curl -s http://127.0.0.1:4000/api/health

# CORS allowlist: the first three origins must be echoed back; the last must not.
# The engine defaults to `*` when ALLOWED_ORIGINS is unset, so this is the check
# that catches a missing, misspelled, or unexported env var — without it, an
# open API looks identical to a correctly configured one.
for o in https://5chan.app https://5archive.org https://5chan.localhost https://unlisted.example; do
  printf '%s -> ' "$o"
  curl -sS -D - -o /dev/null -H "Origin: $o" \
    'https://api.5archive.org/api/search?q=test&limit=1' \
    | grep -i '^access-control-allow-origin:' || echo '(none — correctly blocked)'
done
```

Notes:

- The container uses **host networking** (`network_mode: host`) so
  `ws://localhost:9138` reaches the daemon on the host's loopback; the API
  itself binds `127.0.0.1:4000` only (`HOST=127.0.0.1`).
- The engine builds from its **`master`** branch (it has no `main`).
- SQLite data persists in the `5archive_data` Docker volume.

## 2. Caddy vhost (on the same VPS)

The host runs Caddy as the systemd `caddy` service with `/etc/caddy/Caddyfile`.
Back it up, add one vhost (matching the style of the existing site blocks),
validate, then reload:

```caddy
# 5archive — 5chan archiver API/crawler (-> 127.0.0.1:4000)
api.5archive.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:4000
}
```

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-5archive
# …edit…
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy    # reload, never restart — other sites run here
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

The web UI is **this repo's `webui/`** — a vendored fork of the engine's
webui (see `webui/README.md` for provenance). Deploy it with the Vercel CLI;
no cloning the engine repo.

The live project is `toms-projects-2188af94/5archive` (tomcasaburi's Vercel
account). It is connected to `bitsocialforge/5archive`, with `webui/` as the
project root and `master` as the production branch. Pushing `master` triggers a
production deployment. The CLI remains available for manual fallback deploys.

```bash
cd webui
vercel link --yes --project 5archive    # root = this dir
vercel deploy --prod --yes
```

Set the environment variables (production). These are the **actual names the
webui reads** (`webui/lib/api.ts`, `webui/lib/site.ts`):

| Var | Value | Meaning |
|-----|-------|---------|
| `INDEXER_API` | `https://api.5archive.org` | API base URL (SSR fetches) |
| `SITE_NAME` | `5archive` | Site name in header/titles |
| `SITE_BADGE` | *(empty string)* | No badge — title is just "5archive" |
| `SITE_URL` | `https://5archive.org` | Canonicals, OpenGraph, robots, sitemaps |
| `THEME` | `5chan` | Classic imageboard (yotsuba) skin |
| `BRAND_TEXT` | `A Bitsocial Forge product` | Footer attribution line |
| `BRAND_URL` | `https://bitsocialforge.com` | Footer attribution link |
| `CONTACT_EMAIL` | `abuse@5archive.org` | Takedown/abuse contact on the `/legal` page (content policy + takedown instructions, linked from the footer). |

```bash
printf '%s' "https://api.5archive.org" | vercel env add INDEXER_API production
# …same pattern for the rest; for the empty SITE_BADGE use:
echo '' | vercel env add SITE_BADGE production
```

Deploy and attach the domains:

```bash
vercel deploy --prod --yes
vercel domains add 5archive.org
vercel domains add www.5archive.org
```

Verify: `https://5archive.org` renders board list and search results (SSR —
view-source should contain post content), `/robots.txt` and `/sitemap.xml`
respond, and browser calls to `https://api.5archive.org` pass CORS.

## 5. Updates

| What changed | Do |
|--------------|----|
| Board list (5chan directories) | `node scripts/build-communities.mjs`, `scp -r config root@91.234.199.189:/opt/5archive/`, then `ssh root@91.234.199.189 'cd /opt/5archive && docker compose restart server'`. The same run rewrites `webui/lib/directories.json` (the directory-code URL map) — commit it and redeploy the web UI |
| Takedown blocklist | Edit `config/blocklist.json` (see README), then `scp config/blocklist.json root@91.234.199.189:/opt/5archive/config/` — the engine watches the file and applies it within ~a minute, **no restart** |
| Engine (server) | On the VPS: `cd /opt/5archive && docker compose build --no-cache && docker compose up -d` |
| Web UI | Edit `webui/` in this repo and push `master` for the normal Git-triggered production deployment. For a manual fallback, run `vercel deploy --prod` from `webui/`. Engine-webui upstream improvements are ported into `webui/` manually — there is no automatic sync. |
| This repo's compose/env conventions | `scp docker-compose.yml` to `/opt/5archive/` and `docker compose up -d` |
