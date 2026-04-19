import { db } from "../db";

export type CurrentPhase = "cut" | "maintain" | "bulk";

export type StrengthSignalV2AnchorConfig = {
  cutMaintain?: Record<string, unknown>;
  bulk?: Record<string, unknown>;
  byPhase?: {
    cut?: Record<string, unknown>;
    maintain?: Record<string, unknown>;
    bulk?: Record<string, unknown>;
  };
};

export type StrengthSignalV2PhaseConfig = {
  phases?: {
    cut?: {
      push?: string;
      pull?: string;
      hinge?: string;
      squat?: string;
    };
    maintain?: {
      push?: string;
      pull?: string;
      hinge?: string;
      squat?: string;
    };
    bulk?: {
      horizontalPush?: string;
      verticalPush?: string;
      horizontalPull?: string;
      verticalPull?: string;
      hinge?: string;
      squat?: string;
      carry?: string;
    };
  };
};

export type StrengthSignalConfig = {
  schemaVersion: 2;
  activeVersion: "v1" | "v2";
  v2Anchors?: StrengthSignalV2AnchorConfig;
  strengthSignalV2Config?: StrengthSignalV2PhaseConfig;
  updatedAt?: number;
};

export const CURRENT_PHASE_META_KEY = "app.currentPhase";
export const STRENGTH_SIGNAL_CONFIG_META_KEY = "strengthSignal.config";

const DEFAULT_PHASE: CurrentPhase = "cut";
const DEFAULT_STRENGTH_SIGNAL_CONFIG: StrengthSignalConfig = {
  schemaVersion: 2,
  activeVersion: "v1",
};

function parseStoredJson(valueJson: string | undefined): unknown {
  if (!valueJson) return undefined;
  try {
    return JSON.parse(valueJson);
  } catch {
    return undefined;
  }
}

export function normalizePhase(raw: unknown): CurrentPhase | undefined {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "cut" || value === "maintain" || value === "bulk") return value;
  return undefined;
}

export function phaseToDashboardPhase(phase: CurrentPhase): "CUT" | "MAINTAIN" | "BULK" {
  if (phase === "bulk") return "BULK";
  if (phase === "maintain") return "MAINTAIN";
  return "CUT";
}

export function dashboardPhaseToPhase(raw: unknown): CurrentPhase {
  return normalizePhase(raw) ?? DEFAULT_PHASE;
}

export async function setCurrentPhase(phaseRaw: unknown): Promise<CurrentPhase> {
  const phase = normalizePhase(phaseRaw) ?? DEFAULT_PHASE;
  const now = Date.now();
  await db.app_meta.put({
    key: CURRENT_PHASE_META_KEY,
    valueJson: JSON.stringify({ phase, updatedAt: now }),
    updatedAt: now,
  });
  return phase;
}

export async function getCurrentPhase(options: {
  fallbackPhase?: unknown;
  persistDefaultIfMissing?: boolean;
} = {}): Promise<CurrentPhase> {
  const row = await db.app_meta.get(CURRENT_PHASE_META_KEY);
  const parsed = parseStoredJson(row?.valueJson);
  const storedPhase = normalizePhase((parsed as any)?.phase);
  if (storedPhase) return storedPhase;

  const fallbackPhase = normalizePhase(options.fallbackPhase);
  if (fallbackPhase) {
    await setCurrentPhase(fallbackPhase);
    return fallbackPhase;
  }

  if (options.persistDefaultIfMissing !== false) {
    await setCurrentPhase(DEFAULT_PHASE);
  }
  return DEFAULT_PHASE;
}

function normalizeStrengthSignalConfig(raw: unknown): StrengthSignalConfig {
  const value = raw && typeof raw === "object" ? (raw as any) : {};
  const activeVersion = value.activeVersion === "v2" ? "v2" : "v1";
  return {
    schemaVersion: 2,
    activeVersion,
    ...(value.v2Anchors && typeof value.v2Anchors === "object" ? { v2Anchors: value.v2Anchors } : {}),
    ...(value.strengthSignalV2Config && typeof value.strengthSignalV2Config === "object"
      ? { strengthSignalV2Config: value.strengthSignalV2Config }
      : {}),
    ...(Number.isFinite(Number(value.updatedAt)) ? { updatedAt: Number(value.updatedAt) } : {}),
  };
}

export async function getStrengthSignalConfig(): Promise<StrengthSignalConfig> {
  const row = await db.app_meta.get(STRENGTH_SIGNAL_CONFIG_META_KEY);
  const parsed = parseStoredJson(row?.valueJson);
  const config = normalizeStrengthSignalConfig(parsed);

  if (!row?.valueJson) {
    await setStrengthSignalConfig(config);
  }

  return config;
}

export async function setStrengthSignalConfig(
  configRaw: Partial<StrengthSignalConfig>
): Promise<StrengthSignalConfig> {
  const now = Date.now();
  const config = normalizeStrengthSignalConfig({
    ...DEFAULT_STRENGTH_SIGNAL_CONFIG,
    ...configRaw,
    updatedAt: now,
  });
  await db.app_meta.put({
    key: STRENGTH_SIGNAL_CONFIG_META_KEY,
    valueJson: JSON.stringify(config),
    updatedAt: now,
  });
  return config;
}
