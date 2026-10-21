# Dashboard

Next.js app for projects, notes, sessions and Ask AI. It talks to the API in `services/api`; there is no mock data.

```bash
npm ci
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm run build
```

Configuration lives in `.env.local` (see `.env.example`). It is checked at startup by `src/lib/env.ts`, so a missing or malformed value fails with the variable's name. Setup for the whole stack is in the [root README](../../README.md).
