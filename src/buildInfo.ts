// src/buildInfo.ts
export const BUILD_INFO = {
  // version (manual bump for meaningful releases)
  version: "2026.03.22-hydration-drift-v1",

  // commit hash (from CI or fallback)
  commit: import.meta.env.VITE_GIT_COMMIT ?? "dev",

  // build timestamp
  builtAt: import.meta.env.VITE_BUILD_TIME ?? new Date().toISOString(),

  // human-friendly short build id
  buildId:
    import.meta.env.VITE_BUILD_ID ??
    `local-${new Date().toISOString().slice(0, 19)}`,
};