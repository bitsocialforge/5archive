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

## UI: a 5chan clone

The interface is a near-clone of [5chan](https://github.com/bitsocialnet/5chan)'s,
the way 4archive.org's is of 4chan's: the same board bar, board header, post
markup, Yotsuba / Yotsuba B themes, catalog and home page, with the post form
replaced by links back to 5chan. 5chan's components are client-side (protocol
hooks, stores, router), so they are not imported; instead:

- `styles/themes.css` and `styles/5chan/*.module.css` are **verbatim copies**
  of 5chan's stylesheets (the commit is in each file's header). Re-sync by
  copying the file again, never by editing it; archive-only rules live in
  `styles/archive.module.css`.
- `components/chan/` are server-component ports of 5chan's JSX that emit the
  same DOM and class names (`Post.tsx` ← post-desktop/post-mobile,
  `Markdown.tsx` ← markdown, `BoardsBar.tsx`, `BoardHeader.tsx`, …). 5chan
  picks its desktop or mobile post layout in JavaScript; here both are rendered
  and 5chan's own media queries show one.
- `public/assets/` holds the 5chan images those stylesheets reference.
- Post numbers, media dimensions and quote targets come from each row's `raw`
  signed record (`lib/post.ts`), never from an OP's embedded reply pages, which
  the API does not redact.

Theme choice follows 5chan: Yotsuba for the home page, multiboard views and
NSFW boards, Yotsuba B for worksafe boards (`lib/theme.ts`). The `THEME` env
var is gone.

## Upstream ports

Upstream `webui/` changes carried into this fork since v0.2.0, by upstream
commit (`git show <sha> -- webui/` in the engine repo shows the original diff).

| Upstream | Ported | Change |
|----------|--------|--------|
| `6a29818` | 2026-07-26 | next `^16.2.11` and pinned patched transitive deps (`package.json`, `package-lock.json`). |
| `3b404ad` | 2026-09-02 | `SHOW_NSFW` site-config var (`lib/site.ts`, default `false`) and `search()` always sending `nsfw=` explicitly (`lib/api.ts`), so an instance opts into NSFW results instead of silently inheriting the API's exclude-by-default. |
