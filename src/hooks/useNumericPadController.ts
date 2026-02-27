// src/hooks/UseNumericPadController.ts
// Created on Feb 15 2026, at 2:28PM

import { useEffect, useMemo, useState } from "react";

export type PadField = "weight" | "reps" | "rir";

export type PadTarget = {
  setId: string;
  field: PadField;
};

export type PadCommitFn = (target: PadTarget, value: number | undefined) => Promise<void>;

function isIphoneWidth() {
  if (typeof window === "undefined") return false;
  return window.matchMedia && window.matchMedia("(max-width: 520px)").matches;
}

export function useNumericPadController(commit: PadCommitFn) {
  const [enabled, setEnabled] = useState(false);

  // active target + text buffer (Path 2)
  const [active, setActive] = useState<PadTarget | null>(null);
  const [buffer, setBuffer] = useState<string>("");

  useEffect(() => {
    // iPhone-only
    const apply = () => setEnabled(isIphoneWidth());
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const visible = enabled && !!active;

  const decimalEnabled = useMemo(() => {
    if (!active) return false;
    return active.field === "weight" || active.field === "rir";
  }, [active]);

  function open(target: PadTarget, currentValue?: number) {
    if (!enabled) return;
    setActive(target);
    // default: start with current value if present, else blank (even if placeholder exists)
    setBuffer(currentValue == null ? "" : String(currentValue));
  }

  async function close(commitFirst: boolean) {
    if (!active) return;
    if (commitFirst) await commitActive();
    setActive(null);
    setBuffer("");
  }

  function key(k: string) {
    if (!active) return;

    if (k === ".") {
      if (!decimalEnabled) return;
      if (buffer.includes(".")) return;
      setBuffer((b) => (b.length ? b + "." : "0."));
      return;
    }

    // digits
    if (/^\d$/.test(k)) {
      setBuffer((b) => (b === "0" ? k : b + k));
    }
  }

  function backspace() {
    setBuffer((b) => (b.length ? b.slice(0, -1) : ""));
  }

  function clear() {
    setBuffer("");
  }

  function parseBuffer(): number | undefined {
    const t = buffer.trim();
    if (!t) return undefined;

    // allow "0." while editing, but treat as 0
    if (t === ".") return 0;

    const n = Number(t);
    if (!Number.isFinite(n)) return undefined;
    return n;
  }

  async function commitActive() {
    if (!active) return;
    const value = parseBuffer();

    // field constraints
    let v = value;

    if (active.field === "reps") {
      if (v == null) v = undefined;
      else v = Math.max(0, Math.round(v));
    }
    if (active.field === "weight") {
      if (v == null) v = undefined;
      else v = Math.max(0, v);
    }
    if (active.field === "rir") {
      if (v == null) v = undefined;
      else v = Math.max(0, v);
    }

    await commit(active, v);
  }

  // Next should be handled by caller (it knows set order + next field)
  // We expose commit + keep pad open while caller switches target.
  return {
    enabled,
    visible,
    active,
    buffer,
    decimalEnabled,
    open,
    close,
    key,
    backspace,
    clear,
    commitActive,
    setActive, // used by caller to move to next target
    setBuffer, // if needed
  };
}
