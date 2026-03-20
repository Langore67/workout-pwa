// src/components/information/InformationButton.tsx
/* ============================================================================
   InformationButton.tsx — Reusable Information trigger
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-20-INFO-01
   FILE: src/components/information/InformationButton.tsx
   ============================================================================ */

type InformationButtonProps = {
  onClick: () => void;
  label?: string;
};

export default function InformationButton({
  onClick,
  label = "Open information",
}: InformationButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line2)] bg-[var(--card)] text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--text)]"
    >
      i
    </button>
  );
}