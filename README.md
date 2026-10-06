# GlitchTip frontend (Kudcrafts)

A from-scratch frontend for a self-hosted [GlitchTip](https://glitchtip.com) backend:
a global issue inbox, a dense issue page, ⌘K search, light and dark mode, and a
layout that works on a phone. It talks to an unmodified GlitchTip backend.

Live at https://errors.kudcrafts.com.

## Stack

Vite, React 19, TanStack Router and Query, Tailwind v4. The API client is typed
from the backend's own OpenAPI schema (`src/api/*.d.ts`, generated with
`openapi-typescript`).

## Develop

```bash
bun install
bun run dev        # http://localhost:5180, proxied to GLITCHTIP_API
```

The dev server proxies `/api` and `/_allauth` to `GLITCHTIP_API`
(default `https://glitchtip.kudcrafts.com`) and sign-in uses your normal
GlitchTip account.

## Deploy

`Dockerfile` builds the app and serves it from nginx, which forwards the
backend's paths (`/api`, `/_allauth`, `/accounts`, …) to `BACKEND_URL`. Set
`BACKEND_URL` and `BACKEND_HOST` to point at a different backend. Set the
backend's `GLITCHTIP_URL` to this frontend's URL so alert links open here.

## License

MIT. `src/api/api-schema.d.ts` and `src/api/allauth-schema.d.ts` come from
[glitchtip-frontend](https://gitlab.com/glitchtip/glitchtip-frontend) (MIT,
© GlitchTip).
