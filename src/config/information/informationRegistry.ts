/* ============================================================================
   informationRegistry.ts — Central Information registry
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-20-INFO-01
   FILE: src/config/information/informationRegistry.ts

   Purpose
   - Provide one typed source of truth for Information modal content
   - Keep explanatory content out of page rendering code
   - Make updates easier as Progress pages evolve
   ============================================================================ */

import type { InformationRegistry } from "./informationTypes";

type ChartEntryConfig = {
  title: string;
  ownerPage: string;
  ownerComponent: string;
  lastReviewedBuild: string;
  lastReviewedAt: string;
  summary: string;
  whyItMatters?: string;
  howItWorks: string;
  interpretation?: string[];
  improveConfidence?: string[];
  technicalNotes?: string[];
  notes?: string[];
};

const SHARED_CHART_HOW_TO_USE =
  "Read the chart as a trend view, not a single-point verdict. The visible window is a focused slice of the full timeline. Drag horizontally to move through older or newer data when more history exists. Use the chart together with the readout and surrounding summary stats.";

const SHARED_CHART_TECHNICAL_NOTES = [
  "The visible window shows a focused slice of the full timeline rather than every point at once.",
  "Drag horizontally to move through older or newer data when more history exists.",
  "The right-side axis shows the chart scale.",
  "Sparse or missing data lowers confidence and can make short-term moves look noisier.",
];

function buildMovingPaneChartEntry({
  title,
  ownerPage,
  ownerComponent,
  lastReviewedBuild,
  lastReviewedAt,
  summary,
  whyItMatters,
  howItWorks,
  interpretation = [],
  improveConfidence = [],
  technicalNotes = [],
  notes = [],
}: ChartEntryConfig) {
  return {
    title,
    ownerPage,
    ownerComponent,
    status: "reviewed" as const,
    lastReviewedBuild,
    lastReviewedAt,
    summary,
    whyItMatters,
    howItWorks,
    howToUseIt: SHARED_CHART_HOW_TO_USE,
    interpretation,
    technicalNotes: [...SHARED_CHART_TECHNICAL_NOTES, ...technicalNotes],
    improveConfidence,
    notes,
  };
}

export const informationRegistry = {
    progress: {
      coachExport: {
        title: "Coach Export",
        ownerPage: "ProgressPage",
        ownerComponent: "Copy Coach Export action",
        status: "reviewed",
        lastReviewedBuild: "2026-04-28-INFO-COACH-01",
        lastReviewedAt: "2026-04-28",

        summary:
          "Coach Export is a plain-text coaching handoff. It packages recent body, strength, timeline, and session-signal context into one copy/paste summary.",

        whyItMatters:
          "The export is meant to help a coaching model or human coach interpret what is happening now without digging through raw logs, charts, or sessions one by one.",

        howItWorks:
          "IronForge combines current body-composition trends, phase-quality context, hydration confidence, Strength Signal, anchor lifts, recent training signals, repeated patterns, and export confidence into a single structured text block.",

        howToUseIt:
          "Use Coach Export as structured context for Coach GPT or a real coach. It reports signals, constraints, permissions, and confidence. It does not decide the workout for you.",

        interpretation: [
          "Questions to answer frame the coaching problem, not the workout prescription.",
          "Next Workout Focus reports guardrails, execution priorities, and adjustment triggers rather than exact programming.",
          "Training Signals and Recent Patterns describe what happened recently and what is repeating.",
        ],

        technicalNotes: [
          "The export is plain text by design so it can be pasted directly into a coaching chat or note.",
          "Recent Patterns use the last 4 completed sessions when available.",
          "Low export confidence means a coach should interpret the handoff more cautiously.",
        ],

        notes: [
          "Coach Export is not a next-workout generator. IronForge reports the state of the system; Coach GPT makes workout decisions.",
        ],
      },
      trainingSignals: {
        title: "Training Signals",
        ownerPage: "ProgressPage",
        ownerComponent: "Coach Export training signals section",
        status: "reviewed",
        lastReviewedBuild: "2026-04-28-INFO-COACH-01",
        lastReviewedAt: "2026-04-28",

        summary:
          "Training Signals describe what happened in recent completed sessions based on logged performance and session notes.",

        whyItMatters:
          "A coach needs to know more than bodyweight and charts. Training Signals preserve movement-quality observations, stimulus notes, fatigue notes, and discussion points from the sessions themselves.",

        howItWorks:
          "IronForge extracts lightweight rule-based signals from recent session notes and completed work. Those signals are grouped into movement quality, stimulus or coverage, fatigue or readiness, and discussion themes.",

        howToUseIt:
          "Use Training Signals as recent evidence. They are inputs to Recent Patterns and Next Workout Focus, but they are not a workout prescription by themselves.",

        interpretation: [
          "Exercise-specific bullets are usually more meaningful than generic session-wide bullets.",
          "Repeated signals matter more than one-off notes.",
        ],

        notes: [
          "Training Signals are descriptive only. They are not a split recommendation or program template.",
        ],
      },
      recentPatterns: {
        title: "Recent Patterns",
        ownerPage: "ProgressPage",
        ownerComponent: "Coach Export recent patterns section",
        status: "reviewed",
        lastReviewedBuild: "2026-04-28-INFO-COACH-01",
        lastReviewedAt: "2026-04-28",

        summary:
          "Recent Patterns summarize what has repeated across the last 4 completed sessions.",

        whyItMatters:
          "One session can be noisy. Repeated patterns are more reliable for coaching interpretation and constraint-setting.",

        howItWorks:
          "IronForge looks for repeated movement-quality, stimulus, fatigue, constraint, and progression themes across the last 4 completed sessions. Frequency labels like 3/4 or 4/4 show how often a pattern appeared.",

        howToUseIt:
          "Use Recent Patterns to understand which themes look stable enough to trust. They describe what is repeating, not what the next workout must be.",

        interpretation: [
          "A higher frequency means the pattern is more reliable, not that it is automatically more severe.",
          "Emerging constraints can appear before they become dominant patterns.",
        ],

        technicalNotes: [
          "Patterns are rule-based and frequency-aware.",
          "Recent Patterns use up to the last 4 completed sessions.",
        ],
      },
      nextWorkoutFocus: {
        title: "Next Workout Focus",
        ownerPage: "ProgressPage",
        ownerComponent: "Coach Export next workout focus section",
        status: "reviewed",
        lastReviewedBuild: "2026-04-28-INFO-COACH-01",
        lastReviewedAt: "2026-04-28",

        summary:
          "Next Workout Focus gives constraint and permission guidance for the next coaching decision.",

        whyItMatters:
          "A useful coaching handoff should protect what is working, avoid pushing unstable areas, and define when a coach or athlete should modify the session.",

        howItWorks:
          "IronForge converts recent training signals, recent patterns, and phase-quality context into three practical buckets: progression guardrails, execution priorities, and adjustment triggers.",

        howToUseIt:
          "Guardrails describe what not to push. Execution priorities describe what to protect. Adjustment triggers describe when a movement or session should be modified in real time.",

        interpretation: [
          "This section does not decide the next workout.",
          "It should read like constraints and permissions, not exercise prescriptions.",
        ],

        notes: [
          "Coach GPT or a human coach still decides exercise choice, volume, and progression.",
        ],
      },
      exportConfidence: {
        title: "Export Confidence",
        ownerPage: "ProgressPage",
        ownerComponent: "Coach Export export confidence section",
        status: "reviewed",
        lastReviewedBuild: "2026-04-28-INFO-COACH-01",
        lastReviewedAt: "2026-04-28",

        summary:
          "Export Confidence is the overall trust score for the current Coach Export.",

        whyItMatters:
          "A clean-looking export can still be weak if too much data is missing. Export Confidence helps a coach judge how hard to lean on the summary.",

        howItWorks:
          "IronForge scores available bodyweight, waist, strength, and coherence signals, then rolls them into one overall confidence label.",

        howToUseIt:
          "Higher confidence means enough data exists to interpret the export more directly. Lower confidence means a coach should stay more cautious and rely more on raw context and recent notes.",

        interpretation: [
          "Low confidence does not mean the export is useless. It means the evidence is thinner.",
          "Confidence reflects data quality and completeness, not athlete quality.",
        ],
      },
      anchorLifts: {
        title: "Anchor Lifts",
        ownerPage: "ProgressPage",
        ownerComponent: "Coach Export anchor lifts section",
        status: "reviewed",
        lastReviewedBuild: "2026-04-28-INFO-COACH-01",
        lastReviewedAt: "2026-04-28",

        summary:
          "Anchor Lifts are representative lifts used to summarize recent strength behavior by movement pattern.",

        whyItMatters:
          "A coach needs to see what is actually driving the strength summary. Anchor Lifts make the main contributors visible without dumping every set in the export.",

        howItWorks:
          "IronForge selects representative recent lifts for hinge, squat, push, and pull patterns, then reports the lift, effective load, reps, estimated strength, and date.",

        howToUseIt:
          "Use Anchor Lifts to understand which movements are currently representing each main pattern. They are examples of what is driving the strength summary, not the full program.",

        interpretation: [
          "Anchor Lifts are not necessarily the only important lifts in the block.",
          "If an anchor is missing, confidence in that pattern is lower.",
        ],
      },
    },
    strength: {
      strengthSignal: {
        title: "Strength Signal",
        ownerPage: "StrengthPage",
        ownerComponent: "Strength Signal hero and methodology copy",
        status: "reviewed",
        lastReviewedBuild: "2026-04-05-INFO-SS-01",
        lastReviewedAt: "2026-04-05",

        summary:
          "Strength Signal is IronForge's primary strength trend metric. It blends recent training performance across squat, hinge, push, and pull patterns into one bodyweight-aware signal.",

        whyItMatters:
          "One lift or one workout can swing from fatigue, exercise selection, or normal session noise. Strength Signal uses a broader composite so trend interpretation is more stable and easier to compare over time.",

        howItWorks:
          "The engine scores completed working sets across the four main movement patterns, builds a blended strength composite for each pattern, then averages the four pattern buckets into one primary trend metric. Relative Strength remains available as a secondary linear bodyweight comparison, but it is not the canonical Strength Signal.",

        howItsCalculated:
          "Strength Signal uses Epley-based estimated 1RM values from completed working sets inside a rolling 28-day training window. High-rep sets above 12 reps are excluded from scored e1RM because they are less reliable for estimating maximal strength. Each pattern blends top-set strength, best working-set strength, and exposure, then applies allometric normalization using bodyweight raised to the 0.67 power (BW^0.67). Weekly trend points are snapshots built from overlapping 28-day windows.",

        howToUseIt:
          "Use Strength Signal as the primary strength trend readout. Compare the current value with recent weekly direction, confidence, and context from bodyweight trend. Relative Strength can still help as a secondary comparison lens, but the main product trend should follow Strength Signal.",

        interpretation: [
          "Stable or rising Strength Signal usually supports a favorable interpretation, especially when bodyweight is moving in the intended direction.",
          "Strength Signal is a blended training-performance indicator, not a direct lab measure of force production or muscle mass.",
          "Missing movement patterns can depress the composite because the system averages across four pattern buckets.",
        ],

        technicalNotes: [
          "Formula label: Blended strength signal.",
          "e1RM method: Epley.",
          "Rep cap: 12 scored reps.",
          "Normalization: Allometric (BW^0.67).",
          "Trend method: Weekly snapshots from overlapping 28-day windows.",
          "Confidence note: Requires bodyweight data for full confidence.",
          "Caveat note: Composite averages across four movement pattern buckets.",
          "BW^0.67 is a practical, literature-backed convention for bodyweight normalization, not a universal constant.",
        ],

        improveConfidence: [
          "Log bodyweight consistently so normalization has real body data.",
          "Train enough of squat, hinge, push, and pull patterns to avoid a thin composite.",
          "Interpret short-term weekly moves cautiously because each point uses an overlapping 28-day window.",
        ],

        notes: [
          "Review this entry whenever Strength Signal formula details, normalization rules, rep caps, trend windows, or user-facing interpretation change.",
        ],
      },
      strengthSignalTrend: buildMovingPaneChartEntry({
        title: "Strength Signal Trend",
        ownerPage: "StrengthPage",
        ownerComponent: "Shared Visx trend chart card",
        lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
        lastReviewedAt: "2026-04-29",
        summary:
          "Strength Signal Trend shows the recent timeline of IronForge's primary blended strength metric.",
        whyItMatters:
          "This chart helps you see direction across weekly or monthly snapshots instead of reacting to one workout or one lift.",
        howItWorks:
          "Each point is a Strength Signal snapshot built from recent training data. The chart uses the shared moving-window trend view so you can focus on a small slice of the timeline at a time.",
        interpretation: [
          "Stable or rising values usually support a better strength reading than a repeated slide downward.",
          "Short-term moves can be noisy because each point reflects recent training context rather than one isolated set.",
        ],
        improveConfidence: [
          "Log enough completed working sets across squat, hinge, push, and pull patterns.",
          "Log bodyweight consistently so normalization stays grounded.",
        ],
        technicalNotes: [
          "Resolution controls switch the timeline between weekly and monthly views.",
          "This chart is the primary chart view for Strength Signal.",
        ],
      }),
      relativeStrengthTrend: buildMovingPaneChartEntry({
        title: "Relative Strength Trend",
        ownerPage: "StrengthPage",
        ownerComponent: "Shared Visx trend chart card",
        lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
        lastReviewedAt: "2026-04-29",
        summary:
          "Relative Strength Trend shows bodyweight-normalized strength snapshots across your recent training history.",
        whyItMatters:
          "It gives a secondary comparison lens when bodyweight is changing, especially during a cut or bulk.",
        howItWorks:
          "The chart plots recent Relative Strength points over time using the shared moving-window chart pattern. It is a secondary chart beside Strength Signal rather than the main strength standard.",
        interpretation: [
          "Use this chart to compare strength direction against bodyweight change, not to replace Strength Signal.",
          "A dip here can reflect bodyweight change, thinner training data, or real performance drift.",
        ],
        improveConfidence: [
          "Log bodyweight consistently.",
          "Keep enough recent strength history so the timeline is not built from sparse snapshots.",
        ],
        technicalNotes: [
          "Relative Strength is a secondary comparison lens on this page.",
          "Weekly or monthly labeling depends on the current timeline resolution.",
        ],
      }),
      trendLast12Weeks: {
        title: "Trend (Last 12 Weeks)",
        ownerPage: "StrengthPage",
        ownerComponent: "Trend table section",
        status: "reviewed",
        lastReviewedBuild: "2026-04-29-INFO-STRENGTH-02",
        lastReviewedAt: "2026-04-29",

        summary:
          "This table shows the last 12 weekly Strength trend snapshots in one compact reference view.",

        whyItMatters:
          "It lets you compare recent weekly bodyweight, relative strength, and absolute strength without paging through the chart window.",

        howItWorks:
          "Each row is a weekly snapshot built from the same Strength trend data used elsewhere on the page. The chart window is the focused trend view; this table is the compact week-by-week summary.",

        howToUseIt:
          "Use the table to confirm what the chart is showing and to scan recent weekly changes quickly. Read the rows as trend context, not as isolated verdicts from one week alone.",

        interpretation: [
          "Relative strength is the primary comparison when bodyweight is changing.",
          "Absolute strength is still useful as raw context, but it is not bodyweight-adjusted.",
        ],

        technicalNotes: [
          "The chart and table both reflect recent weekly snapshots rather than single-workout readings.",
          "Bodyweight values are shown as weekly average context when available.",
        ],
      },
    },

    performance: {
      dashboardOverview: {
        title: "Dashboard Overview",
        ownerPage: "PerformanceDashboardPage",
        ownerComponent: "PerformanceOverviewSection",
        status: "reviewed",
        lastReviewedBuild: "2026-04-29-INFO-PERF-01",
        lastReviewedAt: "2026-04-29",

        summary:
          "Dashboard Overview is the high-level coaching summary for Performance.",

        whyItMatters:
          "It keeps the most important phase-aware signals in one place so you do not have to infer the big picture from separate charts first.",

        howItWorks:
          "IronForge combines the current flagship score, recent chart context, and coaching insights into one overview layer. The page uses phase as an interpretation lens, not as a hidden data override.",

        howToUseIt:
          "Start here for the broad read, then use the charts and insight cards to inspect why the dashboard is leaning positive, mixed, or watch.",

        interpretation: [
          "The overview is a synthesis layer, not a replacement for the underlying charts.",
          "Current body metrics stay tied to logged data even when phase changes.",
        ],
      },
      currentPhase: {
        title: "Current Phase",
        ownerPage: "PerformanceDashboardPage",
        ownerComponent: "PerformanceOverviewSection phase selector",
        status: "reviewed",
        lastReviewedBuild: "2026-04-29-INFO-PERF-01",
        lastReviewedAt: "2026-04-29",

        summary:
          "Current Phase tells Performance how to interpret the same body and training data.",

        whyItMatters:
          "The same weight, waist, and strength move can mean something different in a cut, maintain phase, or bulk.",

        howItWorks:
          "CUT favors fat-loss quality and strength retention. MAINTAIN favors stability and recomposition. BULK favors growth with controlled waist drift. Phase changes interpretation language and score expectations, but it does not rewrite your logged data.",

        howToUseIt:
          "Set the phase you are actually running right now, then read the score, insights, and charts through that lens.",

        interpretation: [
          "CUT expects weight and waist direction to support fat loss while strength stays protected.",
          "MAINTAIN expects stable body composition and repeatable performance.",
          "BULK expects growth signals without letting waist drift too fast.",
        ],
      },
      cutQuality: {
        title: "Cut Quality and flagship score",
        ownerPage: "PerformanceDashboardPage",
        ownerComponent: "PerformanceOverviewSection flagship score card",
        status: "reviewed",
        lastReviewedBuild: "2026-04-29-INFO-PERF-01",
        lastReviewedAt: "2026-04-29",

        summary:
          "This score is the dashboard's headline phase-quality readout. In CUT it appears as Cut Quality. In other phases it shifts to the matching flagship interpretation.",

        whyItMatters:
          "It gives one fast read on whether the current phase looks coherent instead of forcing you to combine every chart manually.",

        howItWorks:
          "The score blends broad strength direction, bodyweight trend, waist trend, and phase-aware interpretation rules. In CUT it prefers fat-loss direction with strength preservation. In other phases it reweights the same broad levers toward stability or growth quality.",

        howToUseIt:
          "Use the score as a headline signal, then read the supporting bullets and charts to understand what is driving it.",

        interpretation: [
          "Higher is better, but the score is not a lab measurement or a prescription.",
          "A mixed score usually means one or two levers are lagging even if others look fine.",
        ],

        technicalNotes: [
          "The flagship score is displayed on a 0 to 100 scale for readability.",
          "The exact interpretation changes with the selected phase.",
        ],
      },
      anchorDiagnostics: {
        title: "Anchor Diagnostics",
        ownerPage: "PerformanceDashboardPage",
        ownerComponent: "AnchorDiagnosticsCard",
        status: "reviewed",
        lastReviewedBuild: "2026-04-29-INFO-PERF-01",
        lastReviewedAt: "2026-04-29",

        summary:
          "Anchor Diagnostics shows which shared Strength Signal v2 anchors Performance is currently using by pattern.",

        whyItMatters:
          "If a pattern anchor is missing, auto-selected, or unresolved, it changes how much confidence you should place in that pattern's strength context.",

        howItWorks:
          "The card lists the current pattern anchors, whether they were configured or automatically selected, and why a pattern may still be unresolved.",

        howToUseIt:
          "Use this when a strength summary looks surprising and you want to confirm which anchor lifts are driving the shared view.",

        interpretation: [
          "AUTO means the system selected the best available anchor from recent eligible data.",
          "Configured means an explicit override exists.",
          "Unresolved means the page does not have enough eligible recent data for that pattern.",
        ],
      },
      strengthSignalTrend: buildMovingPaneChartEntry({
        title: "Performance Strength Signal Trend",
        ownerPage: "PerformanceDashboardPage",
        ownerComponent: "DashboardChartCard shared Visx trend chart card",
        lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
        lastReviewedAt: "2026-04-29",
        summary:
          "This chart shows Strength Signal inside the Performance dashboard so you can read strength direction alongside body and training trends.",
        whyItMatters:
          "Performance is a synthesis page, so the chart helps anchor the broader coaching view to a concrete strength timeline.",
        howItWorks:
          "The chart uses the shared Strength Signal timeline with the same moving-window Visx behavior used elsewhere in the app.",
        interpretation: [
          "Read it as the dashboard's strength anchor rather than a standalone coaching decision-maker.",
          "Compare it with bodyweight, waist, and training load for context.",
        ],
        improveConfidence: [
          "Keep bodyweight and strength logs current.",
          "Train enough core patterns to avoid a thin signal.",
        ],
        technicalNotes: [
          "Resolution controls switch between weekly and monthly views.",
        ],
      }),
      bodyWeightTrend: buildMovingPaneChartEntry({
        title: "Performance Body Weight Trend",
        ownerPage: "PerformanceDashboardPage",
        ownerComponent: "DashboardChartCard shared Visx trend chart card",
        lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
        lastReviewedAt: "2026-04-29",
        summary:
          "This chart shows the recent bodyweight timeline used by the Performance dashboard.",
        whyItMatters:
          "Bodyweight gives context for interpreting Strength Signal, waist change, and phase direction.",
        howItWorks:
          "The chart plots bodyweight over time in the shared moving-window chart view so recent direction stays readable on both desktop and mobile.",
        interpretation: [
          "Look for direction and pace, not one-off day-to-day noise.",
          "Use bodyweight together with waist and strength rather than alone.",
        ],
        improveConfidence: [
          "Log bodyweight consistently under similar conditions.",
        ],
        technicalNotes: [
          "Resolution controls can switch between daily, weekly, and monthly views.",
        ],
      }),
      waistTrend: buildMovingPaneChartEntry({
        title: "Performance Waist Trend",
        ownerPage: "PerformanceDashboardPage",
        ownerComponent: "DashboardChartCard shared Visx trend chart card",
        lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
        lastReviewedAt: "2026-04-29",
        summary:
          "This chart shows the recent waist timeline used by the Performance dashboard.",
        whyItMatters:
          "Waist often adds cleaner body-composition context than bodyweight alone.",
        howItWorks:
          "The chart plots recent waist entries over time using the shared moving-window chart pattern.",
        interpretation: [
          "Look for sustained direction rather than reacting to tiny measurement shifts.",
          "Compare waist with bodyweight and strength before making a broader phase judgment.",
        ],
        improveConfidence: [
          "Measure under similar conditions and keep entries reasonably consistent.",
        ],
        technicalNotes: [
          "Resolution controls switch between weekly and monthly views.",
        ],
      }),
      trainingLoadTrend: buildMovingPaneChartEntry({
        title: "Performance Training Load Trend",
        ownerPage: "PerformanceDashboardPage",
        ownerComponent: "DashboardChartCard shared Visx trend chart card",
        lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
        lastReviewedAt: "2026-04-29",
        summary:
          "This chart shows recent training load direction in the Performance dashboard.",
        whyItMatters:
          "Training load helps explain whether strength or recovery changes may reflect a real workload shift.",
        howItWorks:
          "The chart summarizes recent completed training volume over time inside the shared moving-window chart view.",
        interpretation: [
          "Use it to spot broader workload direction, not to judge one session in isolation.",
          "Compare training load with strength and body trends when interpreting fatigue or momentum.",
        ],
        improveConfidence: [
          "Log completed sessions cleanly and consistently.",
        ],
        technicalNotes: [
          "Resolution controls switch between weekly and monthly views.",
        ],
      }),
    },

    mps: {
      currentStatus: {
        title: "Current Status",
        ownerPage: "MpsPage",
        ownerComponent: "Current Status card",
        status: "reviewed",
        lastReviewedBuild: "2026-03-20-INFO-01",
        lastReviewedAt: "2026-03-20",
  
        summary:
          "Current Status shows how complete and trustworthy your Muscle Preservation readout is right now based on the data currently available.",
  
        whyItMatters:
          "A partial signal can still provide useful direction, but it should be interpreted more cautiously until enough waist history exists to support a fuller 14-day comparison.",
  
        howItWorks:
          "The MPS readout combines normalized strength, body-weight trend, and waist trend. When waist history is still building, the page can show a partial signal even if other inputs are already available.",
  
        howToUseIt:
          "Use Current Status to understand whether the signal is ready for stronger interpretation or whether you should focus first on gathering more consistent body data. Early on, progress counts and confidence labels are more useful than strong conclusions.",
  
        interpretation: [
          "Partial Signal means some useful direction may be available, but the full comparison is not yet supported by enough history.",
          "As more waist entries are collected across the comparison window, confidence improves.",
        ],
  
        improveConfidence: [
          "Log waist measurements consistently.",
          "Use similar timing and conditions each time.",
          "Continue collecting entries until the 14-day comparison window has enough history.",
        ],
  
        notes: [
          "Review this entry whenever Current Status wording, readiness thresholds, confidence language, or required input counts change.",
        ],
      },
  
          normalizedStrength: {
            title: "Normalized Strength",
            ownerPage: "MpsPage",
            ownerComponent: "Normalized Strength metric card",
            status: "reviewed",
            lastReviewedBuild: "2026-03-20-INFO-02",
            lastReviewedAt: "2026-03-20",
      
            summary:
              "Normalized Strength is the main performance signal used by MPS. It tracks strength trend in a more stable and bodyweight-aware way than raw lift numbers alone.",
      
            whyItMatters:
              "During fat loss, scale weight can change while training performance fluctuates from fatigue, recovery, and normal session noise. A normalized signal helps estimate whether strength is being preserved well enough to support muscle retention.",
      
            howItWorks:
              "Instead of using one lift or one-session PR, the app builds a blended strength signal across four movement patterns: squat, hinge, push, and pull. This creates a broader and more stable performance readout for MPS.",
      
            howItsCalculated:
              "The score is built from completed working sets in a rolling 28-day window. For each movement pattern, the app scores sets using estimated 1RM, ignores scoring sets above 12 reps for stability, tracks the best top set, averages the best 3 scored working sets, and adds an exposure signal based on hard sets or completed working sets. The pattern score is then normalized by bodyweight using allometric scaling (bodyweight^0.67), and the final Normalized Strength value is the average across squat, hinge, push, and pull patterns.",
      
            howToUseIt:
              "Look at the current value together with the 14-day change and the vs 90-day best comparison. Stable or rising normalized strength during weight loss is generally a good sign for preservation.",
      
            interpretation: [
              "Higher or stable is generally better during a cut.",
              "A small short-term dip can happen from fatigue, recovery debt, or normal noise.",
              "A persistent decline, especially without waist improvement, can signal elevated cut risk.",
            ],
      
            technicalNotes: [
              "The score uses a 28-day rolling strength window.",
              "Bodyweight is based on a 5-day rolling average when available.",
              "Sets above 12 reps are excluded from scored E1RM to improve rep-range stability.",
              "Pattern scoring blends top-set strength, working strength, and exposure.",
              "MPS uses the normalized value rather than the legacy linear relative score.",
              "On the MPS page, the current normalized value is compared to a 14-day anchor and a 90-day best reserve check.",
            ],
      
            notes: [
              "Review this entry whenever normalized strength calculation logic, bodyweight normalization, pattern classification, lookback rules, or MPS interpretation logic changes.",
            ],
    },
  },
  body: {
    weightTrend: buildMovingPaneChartEntry({
      title: "Weight Trend",
      ownerPage: "BodyPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Weight Trend shows recent bodyweight snapshots from the Body page.",
      whyItMatters:
        "It gives a quick direction check without leaving the entry page.",
      howItWorks:
        "The chart plots recent bodyweight entries over time using the shared moving-window chart pattern.",
      interpretation: [
        "Use it for trend direction, not one-off daily swings.",
      ],
      improveConfidence: [
        "Log weight consistently under similar conditions.",
      ],
    }),
    waistTrend: buildMovingPaneChartEntry({
      title: "Waist Trend",
      ownerPage: "BodyPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Waist Trend shows recent waist snapshots from the Body page.",
      whyItMatters:
        "Waist can give a cleaner body-composition direction signal than scale weight alone.",
      howItWorks:
        "The chart plots recent waist entries over time using the shared moving-window chart pattern.",
      interpretation: [
        "Treat small moves cautiously and look for repeated direction.",
      ],
      improveConfidence: [
        "Measure under similar conditions and use a consistent method.",
      ],
    }),
  },
  bodyComposition: {
    weightTrend: buildMovingPaneChartEntry({
      title: "Weight Trend",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Weight Trend shows recent bodyweight direction inside the Body Composition page.",
      whyItMatters:
        "Weight helps anchor interpretation of waist, body-fat, and lean-mass changes.",
      howItWorks:
        "The chart plots recent bodyweight entries over time using the shared moving-window chart pattern.",
      interpretation: [
        "Weight alone does not tell you whether the change is mostly fat, lean mass, or fluid.",
      ],
      improveConfidence: [
        "Log weight consistently under similar conditions.",
      ],
    }),
    waistTrend: buildMovingPaneChartEntry({
      title: "Waist Trend",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Waist Trend shows recent waist direction inside the Body Composition page.",
      whyItMatters:
        "Waist often helps separate useful body-composition direction from noisy scale-weight changes.",
      howItWorks:
        "The chart plots recent waist entries over time using the shared moving-window chart pattern.",
      interpretation: [
        "Waist is most useful when read together with weight and confidence signals.",
      ],
      improveConfidence: [
        "Measure under similar conditions and with a consistent tape method.",
      ],
    }),
    bodyFatTrend: buildMovingPaneChartEntry({
      title: "Body Fat % Trend",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Body Fat % Trend shows recent logged body-fat percentage snapshots.",
      whyItMatters:
        "It gives a direct body-composition signal, but it can be noisier than waist or weight.",
      howItWorks:
        "The chart plots recent body-fat percentage entries over time using the shared moving-window chart pattern.",
      interpretation: [
        "Treat small changes cautiously because body-fat readings can be noisy.",
      ],
      improveConfidence: [
        "Use similar measurement conditions and devices.",
      ],
    }),
    correctedBodyFatTrend: buildMovingPaneChartEntry({
      title: "Corrected Body Fat % Trend",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Corrected Body Fat % Trend shows a fluid-aware body-fat interpretation.",
      whyItMatters:
        "Hydration swings can distort raw body-fat readings, so this view helps reduce false alarms.",
      howItWorks:
        "The chart combines logged body data with fluid-aware interpretation and shows the result in the shared moving-window chart view.",
      interpretation: [
        "Use this chart when hydration may be distorting raw body-fat readings.",
      ],
      improveConfidence: [
        "Log ECW and ICW when available.",
        "Measure under similar hydration conditions when possible.",
      ],
    }),
    fatMassTrend: buildMovingPaneChartEntry({
      title: "Fat Mass Trend",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Fat Mass Trend shows estimated fat mass derived from weight and body-fat data.",
      whyItMatters:
        "It translates percent-based body-fat readings into pounds for easier trend interpretation.",
      howItWorks:
        "The chart derives fat mass from recent body entries and shows the timeline in the shared moving-window chart view.",
      interpretation: [
        "This is derived from other body metrics, so bad source data makes the chart weaker.",
      ],
      improveConfidence: [
        "Log both weight and body-fat percentage consistently.",
      ],
    }),
    leanMassTrend: buildMovingPaneChartEntry({
      title: "Lean Mass Trend",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Lean Mass Trend shows estimated lean mass derived from weight and body-fat data.",
      whyItMatters:
        "It helps you monitor whether body-composition change appears to be preserving lean tissue.",
      howItWorks:
        "The chart derives lean mass from recent body entries and shows the timeline in the shared moving-window chart view.",
      interpretation: [
        "Treat abrupt changes cautiously because hydration can distort lean-mass estimates.",
      ],
      improveConfidence: [
        "Log both weight and body-fat percentage consistently.",
      ],
    }),
    correctedLeanMassTrend: buildMovingPaneChartEntry({
      title: "Corrected Lean Mass Trend",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Corrected Lean Mass Trend shows a fluid-aware lean-mass interpretation.",
      whyItMatters:
        "This view helps reduce false lean-mass alarms when hydration is shifting.",
      howItWorks:
        "The chart applies fluid-aware interpretation to recent body data and shows the result in the shared moving-window chart view.",
      interpretation: [
        "Use this view when raw lean-mass changes may be exaggerated by water balance noise.",
      ],
      improveConfidence: [
        "Log ECW and ICW when available.",
        "Check Hydration Confidence before over-interpreting changes.",
      ],
    }),
    tbwTrend: buildMovingPaneChartEntry({
      title: "TBW Trend",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "TBW Trend shows total body water from ECW plus ICW.",
      whyItMatters:
        "Water balance can explain why body-fat and lean-mass readings look unusually noisy.",
      howItWorks:
        "The chart plots total body water over time in the shared moving-window chart view.",
      interpretation: [
        "Use TBW as hydration context rather than a standalone body-composition verdict.",
      ],
      improveConfidence: [
        "Log ECW and ICW consistently if you want hydration-aware charts to stay useful.",
      ],
    }),
    fluidRatioTrend: buildMovingPaneChartEntry({
      title: "Fluid Ratio Trend",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Fluid Ratio Trend shows ECW divided by TBW over time.",
      whyItMatters:
        "Fluid ratio helps flag whether hydration shifts may be distorting body-composition interpretation.",
      howItWorks:
        "The chart plots recent ECW/TBW values in the shared moving-window chart view.",
      interpretation: [
        "Read this as context for hydration distortion, not as a body-fat or lean-mass result by itself.",
      ],
      improveConfidence: [
        "Log ECW and ICW consistently.",
      ],
    }),
    confidenceTrend: buildMovingPaneChartEntry({
      title: "Confidence Trend",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Shared Visx trend chart card",
      lastReviewedBuild: "2026-04-29-INFO-CHARTS-01",
      lastReviewedAt: "2026-04-29",
      summary:
        "Confidence Trend shows how complete and coherent recent body-composition data has been over time.",
      whyItMatters:
        "A clean-looking trend can still be weak if the underlying body data is thin or inconsistent.",
      howItWorks:
        "The chart plots recent body-composition confidence values in the shared moving-window chart view.",
      interpretation: [
        "Higher confidence means the surrounding body-composition charts are easier to trust.",
      ],
      improveConfidence: [
        "Log weight, waist, body-fat, and hydration markers more consistently.",
      ],
    }),
    phaseQuality: {
      title: "Phase Quality",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Phase Quality section",
      status: "reviewed",
      lastReviewedBuild: "2026-04-28-INFO-BODY-01",
      lastReviewedAt: "2026-04-28",

      summary:
        "Phase Quality reports whether the current phase is behaving the way it should based on body-composition and performance evidence.",

      whyItMatters:
        "A cut, maintain phase, or bulk can all look successful or risky for different reasons. Phase Quality gives one readout for how coherent the current phase looks.",

      howItWorks:
        "IronForge combines recent direction in weight, waist, lean mass, body-fat trend, and strength context into a single phase-quality status with supporting drivers.",

      howToUseIt:
        "Use Phase Quality as a high-level interpretation layer. It helps flag when the phase looks on track, too aggressive, or at risk of poor tradeoffs.",

      interpretation: [
        "On a cut, better outcomes usually mean waist and weight are moving while lean mass and strength stay relatively protected.",
        "Phase Quality is an interpretation aid, not a replacement for reviewing the underlying trends.",
      ],

      technicalNotes: [
        "Phase Quality is phase-aware, so the same weight or strength move can mean different things in a cut, maintain phase, or bulk.",
      ],
    },
    hydrationConfidence: {
      title: "Hydration Confidence",
      ownerPage: "BodyCompositionPage",
      ownerComponent: "Hydration Confidence section",
      status: "reviewed",
      lastReviewedBuild: "2026-04-28-INFO-BODY-01",
      lastReviewedAt: "2026-04-28",

      summary:
        "Hydration Confidence estimates how much you should trust fluid-sensitive body-composition readings right now.",

      whyItMatters:
        "Water balance can distort lean mass, body-fat estimates, and related interpretations. A hydration-aware view helps prevent overreacting to false composition changes.",

      howItWorks:
        "IronForge compares recent body-water and fluid-balance markers against your recent baseline and highest-confidence readings, then assigns a confidence label and interpretation.",

      howToUseIt:
        "Use Hydration Confidence to decide how hard to trust body-composition shifts. It does not override waist or bodyweight trends, but it can explain why lean-mass or body-fat changes may look noisy.",

      interpretation: [
        "Lower confidence means fluid distortion is more likely.",
        "Stable waist and weight trends can still matter even when hydration confidence is weaker.",
      ],

      improveConfidence: [
        "Measure under similar conditions.",
        "Do not over-interpret one outlier reading after unusual hydration, sodium, or recovery swings.",
      ],
    },
  },
} satisfies InformationRegistry;
