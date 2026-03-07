import { db } from "./db";
import { uuid } from "./utils";

export type AppLogType = "import" | "export" | "restore" | "wipe" | "system";
export type AppLogLevel = "info" | "warn" | "error";

export interface AppLogInput {
  type: AppLogType;
  level: AppLogLevel;
  message: string;
  detailsJson?: string;
}

const MAX_APP_LOGS = 100;

export async function addAppLog(input: AppLogInput): Promise<void> {
  const now = Date.now();

  await db.appLogs.add({
    id: uuid(),
    createdAt: now,
    type: input.type,
    level: input.level,
    message: input.message,
    detailsJson: input.detailsJson,
  });

  await trimAppLogs(MAX_APP_LOGS);
}

export async function trimAppLogs(maxEntries = MAX_APP_LOGS): Promise<void> {
  const all = await db.appLogs.orderBy("createdAt").toArray();
  const overflow = all.length - maxEntries;
  if (overflow <= 0) return;

  const idsToDelete = all.slice(0, overflow).map((x) => x.id);
  if (idsToDelete.length) {
    await db.appLogs.bulkDelete(idsToDelete);
  }
}