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
  bodyComposition: {
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
