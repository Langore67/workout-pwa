/* ============================================================================
   getInformationEntry.ts — Information registry lookup helper
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-20-INFO-01
   FILE: src/config/information/getInformationEntry.ts
   ============================================================================ */

import { informationRegistry } from "./informationRegistry";
import type { InformationEntry } from "./informationTypes";

export function getInformationEntry(
  pageKey: keyof typeof informationRegistry,
  entryKey: string,
): InformationEntry | null {
  const pageEntries = informationRegistry[pageKey];
  if (!pageEntries) return null;

  const entry = pageEntries[entryKey];
  if (!entry) return null;

  return entry;
}