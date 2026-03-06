// src/buildInfo.ts
export const BUILD_INFO = {
  // set via Cloudflare Pages env var (see below); fallback for local dev
  commit: import.meta.env.VITE_GIT_COMMIT ?? "dev",
  builtAt: import.meta.env.VITE_BUILD_TIME ?? new Date().toISOString(),
};