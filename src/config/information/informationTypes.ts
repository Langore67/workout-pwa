/* ============================================================================
   informationTypes.ts — Shared Information registry types
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-20-INFO-01
   FILE: src/config/information/informationTypes.ts

   Purpose
   - Define a shared structured schema for Information content
   - Keep Information entries typed and consistent across the app
   - Support review discipline so Information stays aligned with UI changes

   Review contract
   - Any patch that changes metric meaning, thresholds, readiness rules,
     confidence logic, chart interpretation, or recommendation language must
     review both:
       1) on-screen copy
       2) matching Information entry
   ============================================================================ */

export type InformationStatus = "draft" | "reviewed";

export type InformationEntry = {
  title: string;

  ownerPage: string;
  ownerComponent?: string;
  status: InformationStatus;
  lastReviewedBuild: string;
  lastReviewedAt: string;

    summary: string;
    whyItMatters?: string;
    howItWorks?: string;
    howItsCalculated?: string;
    howToUseIt?: string;
    interpretation?: string[];
    technicalNotes?: string[];
    improveConfidence?: string[];
    notes?: string[];
};

export type InformationPageRegistry = Record<string, InformationEntry>;
export type InformationRegistry = Record<string, InformationPageRegistry>;