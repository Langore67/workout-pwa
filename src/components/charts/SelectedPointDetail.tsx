export type SelectedPointDetailTestIds = {
  root?: string;
  header?: string;
  value?: string;
  range?: string;
  delta?: string;
  goal?: string;
};

export type SelectedPointDetailProps = {
  pointLabel: string;
  value: string;
  rangeLabel?: string;
  deltaText?: string;
  goalDistanceText?: string;
  selected?: boolean;
  testIdBase: string;
  testIds?: SelectedPointDetailTestIds;
};

const styles = `
.if-chart-detail{display:flex;flex-direction:column;gap:5px;margin:0 2px 14px;padding:8px 12px;border:1px solid var(--line);border-radius:13px;background:color-mix(in srgb,var(--text) 2.5%,var(--card));color:var(--text);font-size:12px;box-sizing:border-box}
.if-chart-detail-header{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0}
.if-chart-detail-date{min-width:0;color:var(--muted);line-height:1.4}
.if-chart-detail-value{flex:0 0 auto;color:var(--text);font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.if-chart-detail-period{display:flex;gap:6px;flex-wrap:wrap;color:var(--muted);line-height:1.4}
.if-chart-detail-period span+span::before{content:"·";margin-right:6px}
.if-chart-detail-goal{color:var(--muted);line-height:1.4}
@media(max-width:520px){.if-chart-detail{gap:5px;padding:8px 10px}.if-chart-detail-header{gap:7px}.if-chart-detail-value{font-size:14px}.if-chart-detail-period{gap:5px}.if-chart-detail-period span+span::before{margin-right:5px}}
`;

export default function SelectedPointDetail({
  pointLabel,
  value,
  rangeLabel,
  deltaText,
  goalDistanceText,
  selected = false,
  testIdBase,
  testIds = {},
}: SelectedPointDetailProps) {
  return (
    <div className="if-chart-detail" data-testid={testIds.root ?? `${testIdBase}:selected-detail`} aria-live="polite">
      <style>{styles}</style>
      <div className="if-chart-detail-header" data-testid={testIds.header}>
        <div className="if-chart-detail-date" data-testid={`${testIdBase}:selected-detail-label`}>
          {selected ? "Selected point" : "Latest visible point"} · {pointLabel}
        </div>
        <div className="if-chart-detail-value" data-testid={testIds.value ?? `${testIdBase}:selected-detail-value`}>
          {value}
        </div>
      </div>
      {rangeLabel || deltaText ? (
        <div className="if-chart-detail-period">
          {rangeLabel ? <span data-testid={testIds.range ?? `${testIdBase}:selected-detail-range`}>{rangeLabel}</span> : null}
          {deltaText ? <span data-testid={testIds.delta ?? `${testIdBase}:selected-detail-delta`}>{deltaText}</span> : null}
        </div>
      ) : null}
      {goalDistanceText ? (
        <div className="if-chart-detail-goal" data-testid={testIds.goal ?? `${testIdBase}:selected-detail-goal`}>
          {goalDistanceText}
        </div>
      ) : null}
    </div>
  );
}
