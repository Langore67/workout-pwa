import { useId, useState } from "react";

export type PeerReferenceLandmark = { percentile: number; value: number };

export type PeerReferenceViewModel = {
  title: string;
  peerGroupLabel: string;
  currentValue: number;
  currentValueLabel: string;
  percentileBracket?: string;
  positionLabel?: string;
  landmarks: PeerReferenceLandmark[];
  sourceLabel: string;
  disclaimer?: string;
  currentMetricLabel?: string;
  landmarkValueLabel?: (value: number) => string;
  categoryLabels?: [string, string, string];
};

export type PeerReferenceStripTestIds = {
  root?: string;
  toggle?: string;
  summary?: string;
  content?: string;
  marker?: string;
};

const styles = `
.if-peer{padding-top:15px;border-top:1px solid var(--line);color:var(--text);box-sizing:border-box}.if-peer *{box-sizing:border-box}
.if-peer-toggle{appearance:none;display:flex;align-items:center;gap:12px;width:100%;min-height:38px;margin:0;padding:4px 0;border:0;border-radius:0;background:transparent;color:var(--text);font:inherit;text-align:left;box-shadow:none;cursor:pointer;touch-action:manipulation}
.if-peer-toggle:hover{background:transparent}.if-peer-toggle:focus{box-shadow:none}.if-peer-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
.if-peer-toggle-title{flex:0 0 auto;font-size:13px;font-weight:700}.if-peer-toggle-summary{min-width:0;margin-left:auto;overflow:hidden;color:var(--muted);font-size:11px;text-align:right;text-overflow:ellipsis;white-space:nowrap}
.if-peer-chevron{flex:0 0 auto;color:var(--muted);font-size:13px;line-height:1;transition:transform .18s ease}.if-peer-chevron[aria-expanded=true]{transform:rotate(180deg)}
.if-peer-content{padding-top:5px}.if-peer-content[hidden]{display:none}.if-peer-note{color:var(--muted);font-size:10px;line-height:1.4}
.if-peer-summary{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:8px 0 12px;color:var(--muted);font-size:11px;line-height:1.4}.if-peer-summary strong{color:var(--text);font-weight:650}
.if-peer-track-wrap{padding:0 3px}.if-peer-ticks{position:relative;height:15px;margin-bottom:4px;color:var(--muted);font-size:9px;font-variant-numeric:tabular-nums}
.if-peer-tick{position:absolute;white-space:nowrap;transform:translateX(-50%)}.if-peer-tick:first-child{transform:translateX(0)}.if-peer-tick:last-child{transform:translateX(-100%)}
.if-peer-track{position:relative;height:10px;overflow:visible;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 23%,var(--line)) 0%,color-mix(in srgb,var(--accent) 10%,var(--line)) 48%,color-mix(in srgb,var(--text) 20%,var(--line)) 100%)}
.if-peer-divider{position:absolute;top:0;height:100%;border-left:1px solid color-mix(in srgb,var(--card) 75%,transparent)}
.if-peer-marker{position:absolute;top:50%;width:16px;height:16px;border:3px solid var(--card);border-radius:50%;background:var(--accent);box-shadow:0 1px 6px rgba(15,23,42,.25);transform:translate(-50%,-50%)}
.if-peer-labels{display:flex;justify-content:space-between;gap:8px;margin-top:9px;color:var(--muted);font-size:10px;line-height:1.35}.if-peer-labels span{flex:1}.if-peer-labels span:nth-child(2){text-align:center}.if-peer-labels span:last-child{text-align:right}
.if-peer-disclaimer{margin-top:8px;color:var(--muted);font-size:10px;line-height:1.4}
@media(max-width:520px){.if-peer-toggle{gap:8px}.if-peer-toggle-summary{font-size:10px}.if-peer-labels{font-size:9px}.if-peer-ticks{font-size:8px}}
`;

export default function PeerReferenceStrip({ model, testIdBase, defaultExpanded = true, testIds = {} }: {
  model: PeerReferenceViewModel;
  testIdBase: string;
  defaultExpanded?: boolean;
  testIds?: PeerReferenceStripTestIds;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const generatedId = useId().replace(/:/g, "");
  const ordered = [...model.landmarks].sort((a, b) => a.value - b.value);
  const minimum = ordered[0]?.value;
  const maximum = ordered[ordered.length - 1]?.value;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum === maximum) return null;
  const toPosition = (value: number) => ((value - minimum) / (maximum - minimum)) * 100;
  const position = Math.max(0, Math.min(100, toPosition(model.currentValue)));
  const contentId = `${testIdBase.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${generatedId}-peer-content`;
  const summary = model.percentileBracket ?? model.positionLabel ?? model.currentValueLabel;
  const categoryLabels = model.categoryLabels ?? ["Leaner than most", "Typical", "Higher than most"];

  return (
    <section className="if-peer" aria-label={model.title} data-testid={testIds.root ?? `${testIdBase}:peer-reference`}>
      <style>{styles}</style>
      <button type="button" className="if-peer-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((value) => !value)} data-testid={testIds.toggle ?? `${testIdBase}:peer-reference-toggle`}>
        <span className="if-peer-toggle-title" role="heading" aria-level={4}>{model.title}</span>
        <span className="if-peer-toggle-summary" data-testid={testIds.summary}>{summary}</span>
        <span className="if-peer-chevron" aria-hidden="true" aria-expanded={expanded}>⌄</span>
      </button>
      <div id={contentId} className="if-peer-content" hidden={!expanded} data-testid={testIds.content ?? `${testIdBase}:peer-reference-content`}>
        <div className="if-peer-note">{model.sourceLabel} · {model.peerGroupLabel}</div>
        <div className="if-peer-summary">
          <span>{model.currentMetricLabel ?? "Current position"}: <strong>{model.currentMetricLabel ? model.currentValueLabel : model.positionLabel ?? model.currentValueLabel}</strong></span>
          {model.percentileBracket ? <span>{model.percentileBracket}</span> : null}
        </div>
        <div className="if-peer-track-wrap">
          <div className="if-peer-ticks" aria-hidden="true">
            {ordered.map((landmark) => <span key={landmark.percentile} className="if-peer-tick" style={{ left: `${toPosition(landmark.value)}%` }} title={`${landmark.percentile}th percentile · ${model.landmarkValueLabel?.(landmark.value) ?? landmark.value}`}>{landmark.percentile}th</span>)}
          </div>
          <div className="if-peer-track" role="img" aria-label={`${model.currentValueLabel}; ${summary}`}>
            {ordered.slice(1, -1).map((landmark) => <span key={landmark.percentile} className="if-peer-divider" aria-hidden="true" style={{ left: `${toPosition(landmark.value)}%` }} />)}
            <span className="if-peer-marker" style={{ left: `${position}%` }} data-testid={testIds.marker ?? `${testIdBase}:peer-reference-marker`} />
          </div>
          <div className="if-peer-labels" aria-hidden="true">{categoryLabels.map((label) => <span key={label}>{label}</span>)}</div>
        </div>
        {model.disclaimer ? <div className="if-peer-disclaimer">{model.disclaimer}</div> : null}
      </div>
    </section>
  );
}
