# 5archive web UI (vendored fork)

> **Provenance:** vendored from
> [github.com/bitsocialnet/bitsocial-indexer](https://github.com/bitsocialnet/bitsocial-indexer)
> `webui/` at tag **v0.2.0** (GPL-3.0-or-later). This public fork carries the
> 5archive-specific product identity and deployment surface. Upstream
> improvements are ported manually; upstream's `webui/` remains the neutral
> reference.

Next.js (App Router) SSR frontend for [5archive.org](https://5archive.org),
rendering the 5archive API (`INDEXER_API`). See `.env.example` for env vars and
the repo's `DEPLOY.md` for the Vercel deploy runbook.

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## Upstream ports

Upstream `webui/` changes carried into this fork since v0.2.0, by upstream
commit (`git show <sha> -- webui/` in the engine repo shows the original diff).

| Upstream | Ported | Change |
|----------|--------|--------|
| `6a29818` | 2026-07-26 | next `^16.2.11` and pinned patched transitive deps (`package.json`, `package-lock.json`). |
| `3b404ad` | 2026-09-02 | `SHOW_NSFW` site-config var (`lib/site.ts`, default `false`) and `search()` always sending `nsfw=` explicitly (`lib/api.ts`), so an instance opts into NSFW results instead of silently inheriting the API's exclude-by-default. |
