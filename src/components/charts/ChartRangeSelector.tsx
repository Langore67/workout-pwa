import {
  CHART_TIME_RANGE_LABELS,
  CHART_TIME_RANGE_TITLES,
  type ChartTimeRange,
} from "./chartRange";

export default function ChartRangeSelector<T extends ChartTimeRange>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (range: T) => void;
}) {
  return (
    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            className={`btn small ${active ? "primary" : ""}`}
            onClick={() => onChange(option)}
            style={{ minWidth: 34, paddingInline: 10 }}
            title={CHART_TIME_RANGE_TITLES[option]}
            aria-pressed={active}
          >
            {CHART_TIME_RANGE_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
