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
} satisfies InformationRegistry;