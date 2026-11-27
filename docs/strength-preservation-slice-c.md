# Comparable Strength Preservation — Slice C

## Canonical decision chain

`buildCoachExportMetrics` computes the unchanged Strength Signal and builds Slice B's
`StrengthComparabilityEvidence`. `assessComparableStrengthEvidence` produces the canonical
sample-scoped comparable assessment. Phase Quality, Lean Preservation, Coach Intelligence,
Coach State, Coach Report, Coach Export, and the dashboard consume those shared results.

Aggregate Strength Signal remains a separate observation of aggregate performance and training
exposure. Its current value, deltas, best comparison, direction, population changes, bodyweight
normalization input, and calculation confidence remain available. It does not independently
establish comparable strength loss.

## Decision rules

- Phase Quality uses comparable `improving`, `maintained`, or `declining` states for rules that
  require a strength-preservation conclusion. Mixed and insufficient evidence remain non-conclusive.
  The aggregate classification is displayed separately and does not trigger muscle-risk logic.
- Lean Preservation's `Poor` rule requires estimated lean mass below -1.5 lb, waist not improving,
  and supported comparable decline. Mixed or insufficient evidence cannot satisfy the rule.
- Coach Intelligence calls performance `Regressing` only for supported comparable decline.
  Aggregate decline with maintained, improving, mixed, or insufficient comparisons is reported
  without being promoted to confirmed regression.
- Overall confidence counts a supported comparable conclusion, not merely a finite aggregate delta.
- Performance-pressure programming priorities require supported comparable decline. Independent
  body-composition, recovery, movement-quality, fatigue, and joint-feedback guardrails remain active.

## Correlation and limitations

The aggregate delta may appear as context in Phase Quality, Lean Preservation evidence, and Coach
Intelligence, but it is not counted again through legacy Strength Preservation or Lean Preservation
as independent corroboration. Direct comparisons remain a sampled-exercise assessment; they do not
establish a whole-program conclusion. Stale, insufficient, and missing comparisons are excluded from
fresh directional conclusions and retain their provenance.

## Slice D retirement audit

The Phase Quality aggregate severity classifier was retired after Slice C removed its decision and
confidence dependencies. Its cut/maintenance branch classified the first-to-last change across the
last four weekly, overlapping 28-day normalized-index snapshots. Its bulk branch classified the same
four-point comparison using absolute-index units. The different inputs explain the different numeric
scales, but the resulting Stable/Slight Drop/Significant Drop labels had become presentation-only and
added no evidence beyond the preserved numeric delta and direction.

The four-week delta calculator remains because it supplies factual aggregate provenance. The current
Strength Signal, distinct 14-day delta, percentage versus best, snapshot populations, exposure
changes, bodyweight inputs, and direct comparable assessment are unchanged.

Two older 14-day helpers remain outside Phase Quality: Coach Intelligence uses aggregate direction
as context when comparable evidence improves or is maintained, and Lean Preservation records whether
aggregate performance/exposure is pressured. They are active behavioral dependencies, not the retired
Phase Quality severity presentation. Removing or redefining them would change established decisions
or evidence and therefore requires a separately authorized decision-rule slice.
