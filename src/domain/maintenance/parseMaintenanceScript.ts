import { MAINTENANCE_FORMAT, MAINTENANCE_LIMITS, MAINTENANCE_VERSION, type MaintenanceIssue, type MaintenanceScriptV1 } from "./maintenanceTypes";

export type MaintenanceParseResult = { ok: true; script: MaintenanceScriptV1 } | { ok: false; errors: MaintenanceIssue[] };
const issue = (code: string, path: string, message: string): MaintenanceIssue => ({ code, path, message });

function inspectLimits(value: unknown, path: string, depth: number, errors: MaintenanceIssue[]) {
  if (depth > MAINTENANCE_LIMITS.maxDepth) {
    errors.push(issue("MAX_DEPTH", path, `Maximum object nesting depth is ${MAINTENANCE_LIMITS.maxDepth}.`));
    return;
  }
  if (typeof value === "string" && value.length > MAINTENANCE_LIMITS.maxStringLength) {
    errors.push(issue("MAX_STRING_LENGTH", path, `Maximum string length is ${MAINTENANCE_LIMITS.maxStringLength}.`));
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => inspectLimits(item, `${path}[${index}]`, depth + 1, errors));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) inspectLimits(child, path ? `${path}.${key}` : key, depth + 1, errors);
  }
}

export function parseMaintenanceScript(text: string): MaintenanceParseResult {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAINTENANCE_LIMITS.maxFileBytes) {
    return { ok: false, errors: [issue("MAX_FILE_SIZE", "$", `Maintenance JSON exceeds ${MAINTENANCE_LIMITS.maxFileBytes} bytes.`)] };
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { return { ok: false, errors: [issue("MALFORMED_JSON", "$", "Maintenance file is not valid JSON.")] }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: [issue("INVALID_ROOT", "$", "Maintenance JSON root must be an object.")] };
  }
  const root = value as Record<string, unknown>;
  const errors: MaintenanceIssue[] = [];
  if (root.format !== MAINTENANCE_FORMAT) errors.push(issue("UNSUPPORTED_FORMAT", "format", `Expected ${MAINTENANCE_FORMAT}.`));
  if (root.version !== MAINTENANCE_VERSION) errors.push(issue("UNSUPPORTED_VERSION", "version", `Only maintenance version ${MAINTENANCE_VERSION} is supported.`));
  if (Array.isArray(root.operations) && root.operations.length > MAINTENANCE_LIMITS.maxOperations) {
    errors.push(issue("MAX_OPERATIONS", "operations", `Maximum operation count is ${MAINTENANCE_LIMITS.maxOperations}.`));
  }
  inspectLimits(root, "$", 0, errors);
  return errors.length ? { ok: false, errors } : { ok: true, script: root as MaintenanceScriptV1 };
}
