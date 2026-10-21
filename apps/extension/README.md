# Chrome extension

MV3 extension that captures selections and whole conversations from ChatGPT, Claude and Gemini into Connecting Dots projects. It has a popup, a side panel, a background service worker and content scripts.

```bash
npm ci
npm run build          # development build into dist/ (localhost URLs from .env.development)
npm run build:prod     # needs VITE_API_URL and VITE_DASHBOARD_URL (https), see .env.example
npm run typecheck
npm test
```

Load `dist/` in `chrome://extensions` (Developer mode → Load unpacked).

## How the build works

`scripts/build.mjs` builds the popup and side panel with Vite, then bundles `src/background.ts` and `src/content/note-cs.ts` with esbuild using the same env values. It copies `popup.html`, `sidepanel.html`, `icons/` and the per-site extractors in `content-scripts/`, and writes `dist/manifest.json` from `manifest.dist.json`. The manifest gets the `package.json` version and that mode's API and dashboard origins.

All URLs come from `src/config.ts`. Setup for the whole stack is in the [root README](../../README.md).
