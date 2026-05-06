// src/components/ActionMenu.tsx
/* ========================================================================== */
/*  ActionMenu.tsx                                                            */
/*  BUILD_ID: 2026-02-19-AM-11                                                 */
/* -------------------------------------------------------------------------- */
/*  Goals                                                                      */
/*  - iPhone/Safari reliable open on tap (NO double-toggle)                    */
/*  - Use pointer/touch (not click) for trigger                                */
/*  - Use position:fixed popover (no scrollY math)                             */
/*  - Close on outside pointer/touch (capture)                                 */
/* ========================================================================== */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | {
      label: string;
      icon?: React.ReactNode;
      danger?: boolean;
      disabled?: boolean;
      onClick: () => void;
    }
  | { type: "sep" };

export const MenuIcons = {
  edit: "✎",
  rename: "✎",
  duplicate: "⧉",
  archive: "⬇",
  share: "⤴",
  trash: "🗑",
};

export function ActionMenu({
  items,
  theme = "dark",
  ariaLabel = "Actions",
  minWidth = 240,
  compact = false,
  align = "end",
  offsetX = 6,
  offsetY = 0,
  debugTag,
}: {
  items: MenuItem[];
  theme?: "dark" | "light";
  ariaLabel?: string;
  minWidth?: number;
  compact?: boolean;
  align?: "start" | "end";
  offsetX?: number;
  offsetY?: number;
  debugTag?: string;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);

  // Position in VIEWPORT coordinates (since popover is fixed)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Feature detect (prevents iOS double-toggle when both pointer + touch fire)
  const HAS_POINTER = typeof window !== "undefined" && "PointerEvent" in window;

  // --- Breadcrumb 4 (Theme styles) -----------------------------------------
  const styles = useMemo(() => {
    const dark = theme === "dark";
    return {
      kebab: {
        borderRadius: 999,
        width: compact ? 38 : 44,
        height: compact ? 32 : 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        border: "1px solid var(--line)",
        background: "var(--card)",
        boxShadow: "var(--shadow)",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        userSelect: "none",
      } as React.CSSProperties,

      // ✅ fixed in viewport coordinates (iOS-safe)
      popover: {
        position: "fixed" as const,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        minWidth,
        padding: compact ? 6 : 8,
        zIndex: 2147483647,
        borderRadius: compact ? 12 : 14,
        boxShadow: dark ? "0 18px 40px rgba(16,24,40,0.35)" : "0 16px 30px rgba(16,24,40,0.12)",
        background: dark ? "#1f2937" : "var(--card)",
        border: dark ? "1px solid rgba(255,255,255,0.10)" : "1px solid var(--line)",
        transformOrigin: "top right",
        animation: "am-pop 120ms ease-out",
        WebkitTapHighlightColor: "transparent",
      } as React.CSSProperties,

      sep: {
        height: 1,
        margin: "6px 6px",
        background: dark ? "rgba(255,255,255,0.10)" : "var(--line)",
      } as React.CSSProperties,

      rowBase: {
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: compact ? "8px 10px" : "10px 10px",
        border: 0,
        borderRadius: 12,
        background: "transparent",
        fontWeight: compact ? 700 : 800,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        fontSize: compact ? 13 : 14,
      } as React.CSSProperties,

      textColor: dark ? "#e5e7eb" : "var(--text)",
      iconColor: dark ? "#93c5fd" : "var(--muted)",
      dangerColor: dark ? "#fb7185" : "var(--danger)",
      hoverBg: dark ? "rgba(255,255,255,0.06)" : "#f5f6f8",
      dangerHoverBg: dark ? "rgba(251,113,133,0.10)" : "rgba(220,38,38,0.08)",
    };
  }, [theme, pos, minWidth]);

  // --- Breadcrumb 5 (Positioning: fixed + clamp) ---------------------------
  function computePos() {
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;

    const r = btn.getBoundingClientRect();

    // measure popover
    const popW = Math.max(minWidth, pop.offsetWidth);
    const popH = pop.offsetHeight;

    const pad = 8;
    const gap = 8 + offsetY;

    // desired position in viewport coords
    let vTop = r.bottom + gap;
    let vLeft = align === "end" ? r.right - popW : r.left;
    vLeft += offsetX;

    // clamp horiz
    vLeft = Math.max(pad, Math.min(vLeft, window.innerWidth - popW - pad));

    // flip if overflow bottom
    const overflowBottom = vTop + popH + pad > window.innerHeight;
    const aboveTop = r.top - gap - popH;
    const canFlip = aboveTop > pad;
    if (overflowBottom && canFlip) vTop = aboveTop;

    // clamp vert
    vTop = Math.max(pad, Math.min(vTop, window.innerHeight - popH - pad));

    setPos({ top: vTop, left: vLeft });
  }

  useLayoutEffect(() => {
    if (!open) return;
    computePos();
    const raf = requestAnimationFrame(() => computePos());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align, minWidth, offsetX, offsetY]);

  useEffect(() => {
    if (!open) return;

    const onScroll = () => computePos();
    const onResize = () => computePos();

    // capture helps catch nested scrollers
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align, minWidth, offsetX, offsetY]);

  // --- Breadcrumb 6 (Close behavior: pointer/touch capture) -----------------
  useEffect(() => {
    function shouldIgnoreTarget(t: Node) {
      if (btnRef.current?.contains(t)) return true;
      if (popRef.current?.contains(t)) return true;
      return false;
    }

    function onDocDown(e: Event) {
      if (!open) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (shouldIgnoreTarget(t)) return;
      setOpen(false);
    }

    // Use capture so it runs before other handlers; iOS loves this.
    document.addEventListener("pointerdown", onDocDown, true);
    if (!HAS_POINTER) document.addEventListener("touchstart", onDocDown, true);

    return () => {
      document.removeEventListener("pointerdown", onDocDown, true);
      if (!HAS_POINTER) document.removeEventListener("touchstart", onDocDown, true);
    };
  }, [open, HAS_POINTER]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // --- Breadcrumb 7 (Render) ------------------------------------------------
  const popover = open
    ? createPortal(
        <>
          <style>
            {`
              @keyframes am-pop {
                from { transform: scale(0.98); opacity: 0; }
                to   { transform: scale(1); opacity: 1; }
              }
            `}
          </style>

          <div
            ref={popRef}
            role="menu"
            style={styles.popover}
            // block clicks from bubbling up to app
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            {...(!HAS_POINTER ? { onTouchStart: (e: React.TouchEvent) => e.stopPropagation() } : {})}
          >
            {items.map((it, idx) => {
              if ("type" in it && it.type === "sep") return <div key={`sep-${idx}`} style={styles.sep} />;

              const danger = !!it.danger;
              const disabled = !!it.disabled;

              return (
                <button
                  key={`item-${idx}`}
                  role="menuitem"
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    setOpen(false);
                    it.onClick();
                  }}
                  style={{
                    ...styles.rowBase,
                    opacity: disabled ? 0.45 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                    color: danger ? styles.dangerColor : styles.textColor,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = danger
                      ? styles.dangerHoverBg
                      : styles.hoverBg;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <span style={{ width: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: danger ? styles.dangerColor : styles.iconColor }}>{it.icon ?? null}</span>
                  </span>
                  <span style={{ flex: 1, textAlign: "left" }}>{it.label}</span>
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        style={styles.kebab}
        // ✅ iPhone reliable: open on pointer (and ONLY touch if no pointer support)
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        {...(!HAS_POINTER
          ? {
              onTouchStart: (e: React.TouchEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen((v) => !v);
              },
            }
          : {})}
      >
        <span style={{ letterSpacing: 2, fontWeight: 900, color: "var(--muted)", transform: "translateY(-1px)" }}>
          •••
        </span>

        {debugTag ? (
          <span style={{ marginLeft: 6, fontSize: 10, color: "var(--muted)", fontWeight: 800 }}>{debugTag}</span>
        ) : null}
      </button>

      {popover}
    </>
  );
}
