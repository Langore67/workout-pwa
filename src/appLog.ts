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

const MAX_APP_LOGS = 500;

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
  const total = await db.appLogs.count();
  const overflow = total - maxEntries;
  if (overflow <= 0) return;

  const oldest = await db.appLogs.orderBy("createdAt").limit(overflow).toArray();
  if (!oldest.length) return;

  await db.appLogs.bulkDelete(oldest.map((x) => x.id));
}