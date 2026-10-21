/**
 * Build-time configuration — the only place the extension learns where the
 * backend and the dashboard live.
 *
 * Values come from apps/extension/.env.<mode> (or the process environment,
 * which wins) and are inlined at build time: by Vite for the popup and side
 * panel, and by scripts/build.mjs's esbuild `define` for the background
 * service worker and the note content script. scripts/build.mjs refuses to
 * build if either is missing, so they are never undefined at runtime.
 */

/** Backend API base, including the version prefix, e.g. https://api.example.com/api/v1 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL

/** Web dashboard origin, e.g. https://app.example.com */
export const DASHBOARD_URL: string = import.meta.env.VITE_DASHBOARD_URL
