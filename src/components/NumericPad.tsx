// scr/compontnes/NumericPad.tsx
// Created on Feb 15 2026, 2:25PM WST

import React from "react";

type Props = {
  visible: boolean;
  decimalEnabled: boolean;
  onKey: (k: string) => void; // "0".."9" | "." 
  onBackspace: () => void;
  onClear: () => void;
  onNext: () => void;
  onDone: () => void;
  title?: string;
};

export default function NumericPad({
  visible,
  decimalEnabled,
  onKey,
  onBackspace,
  onClear,
  onNext,
  onDone,
  title,
}: Props) {
  if (!visible) return null;

  // iPhone-only feel: fixed, safe-area padding, minimal
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        background: "#fff",
        borderTop: "1px solid rgba(0,0,0,.10)",
        padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
        boxShadow: "0 -10px 25px rgba(16, 24, 40, 0.08)",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="muted" style={{ fontSize: 13 }}>
          {title ?? "Enter value"}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn small" type="button" onClick={onClear}>
            Clear
          </button>
          <button className="btn small primary" type="button" onClick={onDone}>
            Done
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          marginTop: 10,
        }}
      >
        {["1","2","3","4","5","6","7","8","9"].map((k) => (
          <PadButton key={k} onClick={() => onKey(k)} label={k} />
        ))}

        <PadButton
          onClick={() => onKey(".")}
          label="."
          disabled={!decimalEnabled}
        />
        <PadButton onClick={() => onKey("0")} label="0" />
        <PadButton onClick={onBackspace} label="⌫" />

        <button
          className="btn"
          type="button"
          onClick={onNext}
          style={{
            gridColumn: "1 / -1",
            height: 44,
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function PadButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn"
      style={{
        height: 44,
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 900,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {label}
    </button>
  );
}
