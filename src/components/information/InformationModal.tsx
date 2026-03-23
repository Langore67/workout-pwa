// src/components/information/InformationModal.tsx
/* ============================================================================
   InformationModal.tsx — Shared Information modal
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-20-INFO-01
   FILE: src/components/information/InformationModal.tsx
   ============================================================================ */

import React from "react";
import type { InformationEntry } from "../../config/information/informationTypes";

type InformationModalProps = {
  open: boolean;
  onClose: () => void;
  entry: InformationEntry | null;
  context?: {
    waistEntryCount?: number;
    waistTargetCount?: number;
    waistEntriesNeeded?: number;
    confidenceLabel?: string;
  };
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {title}
      </div>

      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </section>
  );
}

export default function InformationModal({
  open,
  onClose,
  entry,
  context,
}: InformationModalProps) {
  if (!open || !entry) return null;

  return (
    <div
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "85vh",
          overflowY: "auto",
          padding: 0,
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            background: "var(--card)",
            borderBottom: "1px solid var(--line)",
            padding: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900 }}>{entry.title}</div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid var(--line)",
              background: "var(--card)",
              borderRadius: 10,
              padding: "8px 12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

{context ? (
  <Section title="Current State">
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div>
        {context.waistEntryCount ?? 0} of {context.waistTargetCount ?? 14} waist measurements collected
      </div>

      <div>Confidence: {context.confidenceLabel ?? "—"}</div>

      <div>
        {context.waistEntriesNeeded ?? 0} more waist{" "}
        {(context.waistEntriesNeeded ?? 0) === 1 ? "entry" : "entries"} needed
      </div>
    </div>
  </Section>
) : null}



        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 22 }}>
          <Section title="Summary">
            <p style={{ margin: 0 }}>{entry.summary}</p>
          </Section>

          {entry.whyItMatters ? (
            <Section title="Why it matters">
              <p style={{ margin: 0 }}>{entry.whyItMatters}</p>
            </Section>
          ) : null}

	    {entry.howItWorks ? (
	      <Section title="How it works">
		<p style={{ margin: 0 }}>{entry.howItWorks}</p>
	      </Section>
	    ) : null}

	    {entry.howItsCalculated ? (
	      <Section title="How it's calculated">
		<p style={{ margin: 0 }}>{entry.howItsCalculated}</p>
	      </Section>
	    ) : null}

	    {entry.howToUseIt ? (
	      <Section title="How to use it">
		<p style={{ margin: 0 }}>{entry.howToUseIt}</p>
	      </Section>
          ) : null}

                    {entry.interpretation?.length ? (
	              <Section title="Interpretation">
	                <ul style={{ margin: 0, paddingLeft: 20 }}>
	                  {entry.interpretation.map((item) => (
	                    <li key={item} style={{ marginBottom: 8 }}>
	                      {item}
	                    </li>
	                  ))}
	                </ul>
	              </Section>
	            ) : null}
	  
	            {entry.technicalNotes?.length ? (
	              <Section title="Technical notes">
	                <ul style={{ margin: 0, paddingLeft: 20 }}>
	                  {entry.technicalNotes.map((item) => (
	                    <li key={item} style={{ marginBottom: 8 }}>
	                      {item}
	                    </li>
	                  ))}
	                </ul>
	              </Section>
	            ) : null}
	  
	            {entry.improveConfidence?.length ? (
	              <Section title="How to improve confidence">
	                <ul style={{ margin: 0, paddingLeft: 20 }}>
	                  {entry.improveConfidence.map((item) => (
	                    <li key={item} style={{ marginBottom: 8 }}>
	                      {item}
	                    </li>
	                  ))}
	                </ul>
	              </Section>
          ) : null}
          {entry.notes?.length ? (
            <Section title="Notes">
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {entry.notes.map((item) => (
                  <li key={item} style={{ marginBottom: 8 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
}