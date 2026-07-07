# 5archive web UI (vendored fork)

> **Provenance:** vendored from
> [github.com/bitsocialnet/bitsocial-indexer](https://github.com/bitsocialnet/bitsocial-indexer)
> `webui/` at tag **v0.2.0** (GPL-3.0-or-later). This is a **private fork, not
> distributed** — GPL-3.0 permits private modification without distribution.
> Upstream improvements are ported manually; upstream's `webui/` remains the
> neutral reference. 5archive-specific UI work happens **here**.

Next.js (App Router) SSR frontend for [5archive.org](https://5archive.org),
rendering the 5archive API (`INDEXER_API`). See `.env.example` for env vars and
the repo's `DEPLOY.md` for the Vercel deploy runbook.

```bash
npm install
npm run typecheck
npm run build
npm run dev
```
