import { clampPaneStartIndex, getMaxPaneStartIndex } from "./chartPaneModel";

type ChartViewportSliderProps = {
  totalCount: number;
  windowSize: number;
  startIndex: number;
  onStartIndexChange: (startIndex: number) => void;
  ariaLabel?: string;
};

export default function ChartViewportSlider({
  totalCount,
  windowSize,
  startIndex,
  onStartIndexChange,
  ariaLabel = "Visible chart window",
}: ChartViewportSliderProps) {
  const maxStart = getMaxPaneStartIndex(totalCount, windowSize);
  const clampedStart = clampPaneStartIndex(startIndex, totalCount, windowSize);
  const visibleEnd = Math.min(totalCount, clampedStart + windowSize);

  if (totalCount <= windowSize) return null;

  const handleValueChange = (nextRawValue: string) => {
    onStartIndexChange(
      clampPaneStartIndex(Number(nextRawValue), totalCount, windowSize)
    );
  };

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span>Slide the visible window through the timeline</span>
        <span>
          {clampedStart + 1}-{visibleEnd} of {totalCount}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={maxStart}
        step={1}
        value={clampedStart}
        aria-label={ariaLabel}
        aria-valuemin={1}
        aria-valuemax={maxStart + 1}
        aria-valuenow={clampedStart + 1}
        aria-valuetext={`${clampedStart + 1} to ${visibleEnd} of ${totalCount}`}
        onInput={(event) => handleValueChange((event.currentTarget as HTMLInputElement).value)}
        onChange={(event) => handleValueChange(event.currentTarget.value)}
        className="block w-full accent-[var(--accent)]"
        style={{ touchAction: "auto" }}
      />
    </div>
  );
}
