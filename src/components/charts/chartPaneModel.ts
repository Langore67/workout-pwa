export type PaneWindow = {
  startIndex: number;
  endIndex: number;
  visibleCount: number;
  totalCount: number;
};

export function getMaxPaneStartIndex(totalCount: number, windowSize: number): number {
  const safeTotal = Math.max(0, totalCount);
  const safeWindowSize = Math.max(1, windowSize);
  return Math.max(0, safeTotal - safeWindowSize);
}

export function getLatestPaneStartIndex(totalCount: number, windowSize: number): number {
  return getMaxPaneStartIndex(totalCount, windowSize);
}

export function clampPaneStartIndex(
  startIndex: number,
  totalCount: number,
  windowSize: number
): number {
  const maxStart = getMaxPaneStartIndex(totalCount, windowSize);
  return Math.max(0, Math.min(maxStart, Math.round(startIndex)));
}

export function getPaneWindow(
  startIndex: number,
  totalCount: number,
  windowSize: number
): PaneWindow {
  const safeWindowSize = Math.max(1, windowSize);
  const clampedStart = clampPaneStartIndex(startIndex, totalCount, safeWindowSize);
  const safeTotal = Math.max(0, totalCount);
  const endIndex =
    safeTotal > 0
      ? Math.min(safeTotal - 1, clampedStart + safeWindowSize - 1)
      : 0;
  const visibleCount = safeTotal > 0 ? endIndex - clampedStart + 1 : 0;

  return {
    startIndex: clampedStart,
    endIndex,
    visibleCount,
    totalCount: safeTotal,
  };
}

export function getOlderPaneStartIndex(
  startIndex: number,
  totalCount: number,
  windowSize: number
): number {
  return clampPaneStartIndex(startIndex - Math.max(1, windowSize), totalCount, windowSize);
}

export function getNewerPaneStartIndex(
  startIndex: number,
  totalCount: number,
  windowSize: number
): number {
  return clampPaneStartIndex(startIndex + Math.max(1, windowSize), totalCount, windowSize);
}

