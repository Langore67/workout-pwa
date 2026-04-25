# Chart Migration Audit

Date: 2026-04-24

## Scope

This audit covers the current chart surface in IronForge for a possible `Recharts -> VisX` migration. It is based on repo inspection only. No production code was changed.

## High-Level Findings

- The repo has one actual charting dependency today: `recharts` in [package.json](../package.json).
- There is no current `@visx/*` usage in the repo.
- Most chart pages do not own chart logic directly. They funnel through one shared renderer: [src/components/charts/TrendChartCard.tsx](../src/components/charts/TrendChartCard.tsx).
- The main migration decision is therefore not page-by-page first. It is whether to replace or parallel a new shared chart shell.
- The custom behavior already built around Recharts is non-trivial:
  - custom hover readout bridge
  - edge-aware tooltip placement
  - paged/windowed view state
  - slider-driven viewport
  - trend-line overlay
  - dynamic Y-domain padding
- The strongest case for VisX is the shared `TrendChartCard` path, especially where IronForge wants precise control over hover/cursor/readout behavior.
- Thin wrappers like `DashboardChartCard` are not migration targets by themselves. They should follow whatever happens to the shared chart shell.
- The simplest trend surfaces on Body and Body Composition are not urgent VisX work. They benefit less from a migration than the shared shell and Performance strength chart path.
- Strength page also has two small custom SVG sparklines that are already simpler than either Recharts or VisX. Those should stay custom.

## Files Inspected

- [package.json](../package.json)
- [src/components/charts/TrendChartCard.tsx](../src/components/charts/TrendChartCard.tsx)
- [src/components/charts/ChartTooltipContent.tsx](../src/components/charts/ChartTooltipContent.tsx)
- [src/components/charts/ChartViewportSlider.tsx](../src/components/charts/ChartViewportSlider.tsx)
- [src/components/charts/chartPaneModel.ts](../src/components/charts/chartPaneModel.ts)
- [src/components/charts/chartDomain.ts](../src/components/charts/chartDomain.ts)
- [src/components/charts/chartFormatters.ts](../src/components/charts/chartFormatters.ts)
- [src/components/charts/chartTypes.ts](../src/components/charts/chartTypes.ts)
- [src/components/performance/DashboardChartCard.tsx](../src/components/performance/DashboardChartCard.tsx)
- [src/components/performance/PerformanceStrengthSignalSection.tsx](../src/components/performance/PerformanceStrengthSignalSection.tsx)
- [src/components/performance/StrengthSignalDetailsCard.tsx](../src/components/performance/StrengthSignalDetailsCard.tsx)
- [src/pages/PerformanceDashboardPage.tsx](../src/pages/PerformanceDashboardPage.tsx)
- [src/pages/StrengthPage.tsx](../src/pages/StrengthPage.tsx)
- [src/pages/BodyPage.tsx](../src/pages/BodyPage.tsx)
- [src/pages/BodyCompositionPage.tsx](../src/pages/BodyCompositionPage.tsx)
- [src/styles.css](../src/styles.css)

## Chart Inventory

| Surface | File path | Purpose | Library used | Interaction complexity | Custom behavior | VisX assessment | Classification |
|---|---|---|---|---|---|---|---|
| Shared trend renderer | [src/components/charts/TrendChartCard.tsx](../src/components/charts/TrendChartCard.tsx) | Single shared line-chart shell for Strength, Performance, Body, and Body Composition | Recharts | High | `ResponsiveContainer`, custom stat-row hover bridge, custom tooltip content, trend line overlay, pane navigation, slider viewport, dynamic domains, readout modes | Strongest migration payoff. This is where VisX would give more precise control and reduce “working around the library” behavior | **High-priority VisX candidate** |
| Shared tooltip renderer | [src/components/charts/ChartTooltipContent.tsx](../src/components/charts/ChartTooltipContent.tsx) | Shared compact tooltip body for single- and multi-series charts | Recharts-coupled custom component | Medium | edge-aware positioning based on Recharts `coordinate` and `viewBox` | Migrate only with the shared shell. Not useful as a standalone migration target | **Keep Recharts for now** |
| Shared viewport slider | [src/components/charts/ChartViewportSlider.tsx](../src/components/charts/ChartViewportSlider.tsx) | Slider for moving through visible chart window | Custom HTML | Low | range input, ARIA labeling, pane-window coordination | Already library-agnostic. Keep as-is and reuse with VisX later | **Keep Recharts for now** |
| Shared pane model | [src/components/charts/chartPaneModel.ts](../src/components/charts/chartPaneModel.ts) | Windowing math for chart paging and slider movement | Custom logic | Low | latest/older/newer pane indices, clamping | Library-agnostic and worth preserving | **Keep Recharts for now** |
| Shared domain helpers | [src/components/charts/chartDomain.ts](../src/components/charts/chartDomain.ts) | Numeric extraction and Y-axis domain padding | Custom logic | Low | `auto`, `tight`, `zeroBased` padding modes | Library-agnostic and reusable if VisX is introduced | **Keep Recharts for now** |
| Shared formatters | [src/components/charts/chartFormatters.ts](../src/components/charts/chartFormatters.ts) | Display formatters for lbs, inches, percent, decimals | Custom logic | Low | formatter reuse across chart consumers | No migration value by itself | **Keep Recharts for now** |
| Shared chart types | [src/components/charts/chartTypes.ts](../src/components/charts/chartTypes.ts) | Shared chart prop/data types | Custom TS types | Low | unifies chart series contract | Useful seam if a parallel `VisxTrendChartCard` is introduced | **Keep Recharts for now** |
| Performance dashboard wrapper | [src/components/performance/DashboardChartCard.tsx](../src/components/performance/DashboardChartCard.tsx) | Wraps a trend chart with analysis, interpretation, movers, and movement breakdown | Recharts via shared `TrendChartCard` | Medium | non-chart UI around the shared chart; expandable movement details | Thin wrapper. No reason to migrate separately from the base chart | **Keep Recharts for now** |
| Performance strength section | [src/components/performance/PerformanceStrengthSignalSection.tsx](../src/components/performance/PerformanceStrengthSignalSection.tsx) | Performance strength chart plus details/debug surface | Recharts via `DashboardChartCard` | Medium | couples chart with coaching/debug context | High-value consumer once a VisX shared shell exists, but not a first independent migration | **Good VisX candidate** |
| Performance strength chart | [src/pages/PerformanceDashboardPage.tsx](../src/pages/PerformanceDashboardPage.tsx) | Primary charted strength trend in Performance | Recharts via shared shell | High | time range control, shared strength trend data, custom details and diagnostics nearby | Strategic chart surface. Good validation target after the shared shell is ported | **High-priority VisX candidate** |
| Performance body weight chart | [src/pages/PerformanceDashboardPage.tsx](../src/pages/PerformanceDashboardPage.tsx) | Body-weight trend on Performance | Recharts via shared shell | Low | formatter only | Low migration urgency | **Keep Recharts for now** |
| Performance waist chart | [src/pages/PerformanceDashboardPage.tsx](../src/pages/PerformanceDashboardPage.tsx) | Waist trend on Performance | Recharts via shared shell | Low | formatter only | Low migration urgency | **Keep Recharts for now** |
| Performance volume chart | [src/pages/PerformanceDashboardPage.tsx](../src/pages/PerformanceDashboardPage.tsx) | Weekly training-volume trend | Recharts via shared shell | Low | formatter only | Low migration urgency | **Keep Recharts for now** |
| Strength signal trend | [src/pages/StrengthPage.tsx](../src/pages/StrengthPage.tsx) | Weekly normalized strength signal snapshots | Recharts via shared shell | Medium | moving-pane slider, stat-row readout, trend line | Good candidate after the shared shell is stable in VisX | **Good VisX candidate** |
| Relative strength trend | [src/pages/StrengthPage.tsx](../src/pages/StrengthPage.tsx) | Weekly bodyweight-normalized strength trend | Recharts via shared shell | Medium | stat-row readout, trend line | Same profile as the main Strength chart | **Good VisX candidate** |
| Strength sparklines | [src/pages/StrengthPage.tsx](../src/pages/StrengthPage.tsx) | Tiny bodyweight and absolute-strength sparklines in stat cards | Custom SVG | Low | inline SVG path generation | Already appropriately simple. Do not migrate to VisX | **Keep Recharts for now** |
| Body weight trend | [src/pages/BodyPage.tsx](../src/pages/BodyPage.tsx) | Quick bodyweight trend snapshots | Recharts via shared shell | Low | formatter, tooltip label formatting | Simple chart. VisX adds little value today | **Remove/simplify candidate** |
| Body waist trend | [src/pages/BodyPage.tsx](../src/pages/BodyPage.tsx) | Quick waist trend snapshots | Recharts via shared shell | Low | formatter, tooltip label formatting | Same as weight trend. Also appears to still pass stale `showBrush` props that are no longer part of the shared chart contract | **Remove/simplify candidate** |
| Body Composition trend grid | [src/pages/BodyCompositionPage.tsx](../src/pages/BodyCompositionPage.tsx) | Nine single-series metric trends: weight, waist, body fat %, corrected body fat %, fat mass, lean mass, corrected lean mass, TBW, fluid ratio | Recharts via shared shell | Low to Medium | many simple series configs, mostly formatting and empty states | Good candidate only after the shared shell migration proves out. Not a first move | **Good VisX candidate** |
| Recharts-focused styling hooks | [src/styles.css](../src/styles.css) | Focus and surface styling for Recharts DOM | CSS for Recharts | Low | `.recharts-wrapper`, `.recharts-surface` selectors | Will need cleanup if Recharts is removed | **Keep Recharts for now** |

## Notes On Current Complexity

### Why `TrendChartCard` is the migration choke point

The shared chart shell already contains behavior that is more custom than typical “drop in a Recharts line chart” usage:

- hidden tooltip bridge for stat-row hover readout
- explicit `onMouseMove`, `onMouseEnter`, `onClick`, `onMouseLeave` state handling
- tooltip body placement logic that depends on chart coordinates
- chart host measurement and render gating with `ResizeObserver`
- optional moving window model and custom slider
- custom trend-line overlay

That is exactly the kind of surface where VisX usually makes sense: lower-level primitives, less fighting with library assumptions, and tighter ownership of interaction behavior.

### Why simple charts are not the first migration target

Body and Body Composition mostly use straightforward single-series lines with formatters and empty states. Those are not where Recharts is causing meaningful pain in this repo. Migrating them first would create churn without paying down the harder interactive chart constraints.

### Body page simplification note

The Body page still passes `showBrush={...}` into `TrendChartCard`, while the shared chart contract no longer advertises a brush feature. That suggests either stale call-site noise or a previously removed feature seam. That makes Body a better simplification target than a high-priority VisX target.

## Recommended Migration Order

1. **Prototype a parallel VisX shared trend shell**
   - Target: a new component parallel to `TrendChartCard`, not an in-place rewrite first
   - Scope: single-series line chart, stat-row readout, tooltip, trend line, dynamic domain
   - Why first: this is the real dependency seam used by all chart pages

2. **Validate the VisX shell on Performance strength**
   - Target: Performance strength chart path first, not body/waist/volume
   - Why second: highest-value chart with the most custom behavior near it

3. **Migrate Strength page charts**
   - Target: Strength signal trend and relative strength trend
   - Why third: still meaningful, but slightly less operationally dense than Performance

4. **Migrate Body Composition grid if the shared VisX shell proves stable**
   - Target: the chartConfigs-driven trend grid
   - Why fourth: many charts, but each is simple once the shared shell is solved

5. **Re-evaluate Body page**
   - Likely outcome: simplify or keep on the shared shell rather than prioritizing a VisX-specific port

## Recommended Classification Summary

### High-priority VisX candidates

- [src/components/charts/TrendChartCard.tsx](../src/components/charts/TrendChartCard.tsx)
- Performance strength chart path in [src/pages/PerformanceDashboardPage.tsx](../src/pages/PerformanceDashboardPage.tsx)

### Good VisX candidates

- [src/components/performance/PerformanceStrengthSignalSection.tsx](../src/components/performance/PerformanceStrengthSignalSection.tsx)
- Strength charts in [src/pages/StrengthPage.tsx](../src/pages/StrengthPage.tsx)
- Body Composition trend grid in [src/pages/BodyCompositionPage.tsx](../src/pages/BodyCompositionPage.tsx)

### Keep Recharts for now

- [src/components/performance/DashboardChartCard.tsx](../src/components/performance/DashboardChartCard.tsx)
- [src/components/charts/ChartTooltipContent.tsx](../src/components/charts/ChartTooltipContent.tsx)
- [src/components/charts/ChartViewportSlider.tsx](../src/components/charts/ChartViewportSlider.tsx)
- [src/components/charts/chartPaneModel.ts](../src/components/charts/chartPaneModel.ts)
- [src/components/charts/chartDomain.ts](../src/components/charts/chartDomain.ts)
- [src/components/charts/chartFormatters.ts](../src/components/charts/chartFormatters.ts)
- Strength page sparklines in [src/pages/StrengthPage.tsx](../src/pages/StrengthPage.tsx)

### Remove/simplify candidates

- Body page trend cards in [src/pages/BodyPage.tsx](../src/pages/BodyPage.tsx)

## Risks

- A direct in-place rewrite of `TrendChartCard` would have wide blast radius across Strength, Performance, Body, and Body Composition.
- Recharts-specific tooltip and cursor behavior is currently embedded in the shared shell. That logic will need a deliberate rewrite, not a mechanical port.
- CSS currently targets Recharts DOM classes in [src/styles.css](../src/styles.css). Those selectors will become dead or incomplete during migration.
- Because most pages share one renderer, regression testing has to cover multiple pages even if only one shared component changes.
- If the goal is only to improve simple line-chart rendering, VisX may be more work than value. The strongest justification is better control of the custom interaction model already present.

## Practical Recommendation

Do not frame this as “migrate all charts.” Frame it as:

1. build a parallel VisX version of the shared trend shell,
2. prove it on the Performance strength chart,
3. then decide whether the rest of the simple trend charts should follow or stay on the existing shell.
