export const TRAINING_ROLES = [
  "primary",
  "accessory",
  "corrective",
  "deprioritized",
] as const;

export type TrainingRole = (typeof TRAINING_ROLES)[number];

export const TRAINING_ROLE_LABELS: Record<TrainingRole, string> = {
  primary: "Primary",
  accessory: "Accessory",
  corrective: "Corrective",
  deprioritized: "Deprioritized",
};

export const TRAINING_ROLE_OPTIONS = TRAINING_ROLES.map((value) => ({
  value,
  label: TRAINING_ROLE_LABELS[value],
}));

export function parseTrainingRole(value: unknown): TrainingRole | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return TRAINING_ROLES.includes(normalized as TrainingRole)
    ? (normalized as TrainingRole)
    : undefined;
}

export function getTrainingRoleLabel(role: TrainingRole): string {
  return TRAINING_ROLE_LABELS[role];
}
