import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The API is the only other origin the dashboard talks to. src/lib/env.ts
// validates this variable at startup; here a bad value just leaves it out.
function apiOrigin(): URL | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? "");
  } catch {
    return null;
  }
}
const api = apiOrigin();

// Header-based CSP (no nonces): every page is static and renders in the
// browser, and nonces would force per-request server rendering. So inline
// scripts stay allowed — Next's bootstrap and the theme script in
// app/layout.tsx need them — but injected script can't load code from
// elsewhere, can only send data to this origin and the API, can't be framed
// (clickjacking), and can't use plugins, <base> or foreign form targets.
// Nonces or Next's experimental SRI are the next step up.
const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': Shiki's highlighter compiles a WebAssembly grammar
  // engine. Dev also needs 'unsafe-eval' for React's error overlays.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  // BlockNote, KaTeX and Shiki set inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Captured AI answers can embed images from anywhere on https.
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  `connect-src 'self'${api ? ` ${api.origin}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Only once the API is on https — upgrading http://localhost would break it.
  ...(api?.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // A stray package-lock.json under the user's home directory made Turbopack
  // misdetect the workspace root two levels up, watching the whole home
  // folder instead of just this project — pin it explicitly.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async redirects() {
    // The Settings page was a mock with buttons that did nothing; it comes
    // back with real account settings (beta plan M3.3). Temporary (307), so
    // browsers don't remember it.
    return [{ source: "/settings", destination: "/notes", permanent: false }];
  },
};

export default nextConfig;
