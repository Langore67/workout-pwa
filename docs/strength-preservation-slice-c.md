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

## Threshold audit

The existing aggregate thresholds are unchanged:

- Cut/maintenance: improving above +0.03; stable at -0.03 or higher; slight drop through -0.08;
  significant drop below -0.08.
- Bulk: improving above +8; stable at -5 or higher; drop through -15; significant drop below -15.

These thresholds now classify aggregate context only where comparable preservation is at issue.
Their different scales/units remain unresolved and require a separate calibration slice.
