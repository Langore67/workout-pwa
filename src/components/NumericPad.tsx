import React from "react";

type RightColumnButton = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
};

type Props = {
  visible: boolean;
  decimalEnabled: boolean;
  onKey: (k: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onNext: () => void;
  onDone: () => void;
  title?: string;
  layout?: "default" | "strongColumn";
  rightColumnButtons?: RightColumnButton[];
  theme?: "default" | "ironforge";
  position?: "fixed" | "static";
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
  layout = "default",
  rightColumnButtons = [],
  theme = "default",
  position = "fixed",
}: Props) {
  if (!visible) return null;

  const ironforge = theme === "ironforge";
  const surfaceStyle: React.CSSProperties = ironforge
    ? {
        background: "linear-gradient(180deg, rgba(248,250,252,0.98), rgba(226,232,240,0.98))",
        borderTop: "1px solid rgba(148,163,184,0.35)",
        boxShadow: "0 -16px 40px rgba(15,23,42,0.18)",
      }
    : {
        background: "#fff",
        borderTop: "1px solid rgba(0,0,0,.10)",
        boxShadow: "0 -10px 25px rgba(16, 24, 40, 0.08)",
      };

  return (
    <div
      data-testid="numeric-pad"
      style={{
        position,
        left: position === "fixed" ? 0 : undefined,
        right: position === "fixed" ? 0 : undefined,
        bottom: position === "fixed" ? 0 : undefined,
        zIndex: position === "fixed" ? 2000 : undefined,
        padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
        ...surfaceStyle,
      }}
    >
      <div
        className="muted"
        style={{
          fontSize: 13,
          marginBottom: 10,
          color: ironforge ? "#475569" : undefined,
          fontWeight: 700,
          letterSpacing: 0.2,
        }}
      >
        {title ?? "Enter value"}
      </div>

      {layout === "strongColumn" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 64px", gap: 10, paddingRight: 72 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
              <PadButton key={k} onClick={() => onKey(k)} label={k} theme={theme} />
            ))}

            <PadButton onClick={() => onKey(".")} label="." disabled={!decimalEnabled} theme={theme} />
            <PadButton onClick={() => onKey("0")} label="0" theme={theme} />
            <PadButton onClick={onBackspace} label="⌫" theme={theme} />
          </div>

          <div style={{ display: "grid", gridTemplateRows: "repeat(4, 1fr)", gap: 10 }}>
            {rightColumnButtons.map((button) => (
              <PadButton
                key={button.key}
                onClick={button.onClick}
                label={button.label}
                disabled={button.disabled}
                testId={button.testId}
                theme={theme}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn small" type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClear}>
                Clear
              </button>
              <button
                className="btn small primary"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onDone}
              >
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
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
              <PadButton key={k} onClick={() => onKey(k)} label={k} theme={theme} />
            ))}

            <PadButton onClick={() => onKey(".")} label="." disabled={!decimalEnabled} theme={theme} />
            <PadButton onClick={() => onKey("0")} label="0" theme={theme} />
            <PadButton onClick={onBackspace} label="⌫" theme={theme} />

            <button
              className="btn"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
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
        </>
      )}
    </div>
  );
}

function PadButton({
  label,
  onClick,
  disabled,
  testId,
  theme = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  theme?: "default" | "ironforge";
}) {
  const ironforge = theme === "ironforge";
  return (
    <button
      type="button"
      data-testid={testId}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className="btn"
      style={{
        height: 44,
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 900,
        opacity: disabled ? 0.35 : 1,
        background: ironforge ? "rgba(255,255,255,0.82)" : undefined,
        borderColor: ironforge ? "rgba(148,163,184,0.35)" : undefined,
        color: ironforge ? "#0f172a" : undefined,
        boxShadow: ironforge ? "inset 0 1px 0 rgba(255,255,255,0.7)" : undefined,
      }}
    >
      {label}
    </button>
  );
}
