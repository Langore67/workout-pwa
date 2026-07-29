import React from "react";

const focusByPanelId = new Map<string, HTMLElement>();

function getFocusable(panel: HTMLElement) {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden"));
}

export function openCoachDetailsPanel(panelId: string, trigger: HTMLElement) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  focusByPanelId.set(panelId, trigger);
  panel.removeAttribute("hidden");
  panel.setAttribute("aria-hidden", "false");
  getFocusable(panel)[0]?.focus();
}

export function closeCoachDetailsPanel(panelId: string) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.setAttribute("hidden", "");
  panel.setAttribute("aria-hidden", "true");
  focusByPanelId.get(panelId)?.focus();
  focusByPanelId.delete(panelId);
}

export function CoachDetailsPanel({
  id,
  title,
  status,
  children,
}: {
  id: string;
  title: string;
  status?: string | null;
  children: React.ReactNode;
}) {
  const titleId = `${id}-title`;
  const close = () => closeCoachDetailsPanel(id);

  return (
    <div
      id={id}
      hidden
      aria-hidden="true"
      aria-modal="true"
      aria-labelledby={titleId}
      role="dialog"
      onClick={close}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }

        if (event.key !== "Tab") return;
        const focusable = getFocusable(event.currentTarget);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483646,
        background: "rgba(0, 0, 0, 0.4)",
        padding: 16,
        overflowY: "auto",
      }}
    >
      <div
        className="card"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: 0,
          margin: "0 auto",
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
          <div>
            <h2 id={titleId} style={{ margin: 0, fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>
              {title}
            </h2>
            {status ? (
              <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 800 }}>
                {status}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={`Close ${title}`}
            onClick={close}
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
        <div style={{ padding: 16, display: "grid", gap: 18 }}>{children}</div>
      </div>
    </div>
  );
}
