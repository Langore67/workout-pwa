export type BuildInfo = {
  version: string;
  commit: string;
  displayCommit: string;
  branch: string;
  builtAt: string;
  dirty: boolean;
};

declare global {
  // Injected by vite.config.ts for both development and production builds.
  var __IRONFORGE_BUILD_INFO__: BuildInfo | undefined;
}

const fallbackBuildInfo: BuildInfo = {
  version: 'v0.0.0',
  commit: 'unknown',
  displayCommit: 'unknown',
  branch: 'unknown',
  builtAt: 'unknown',
  dirty: false,
};

export const buildInfo = globalThis.__IRONFORGE_BUILD_INFO__ ?? fallbackBuildInfo;
