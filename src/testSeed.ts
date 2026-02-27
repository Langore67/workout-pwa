import { db } from "./db";
import { uuid } from "./utils";

export async function seedForE2E() {
  // Only seed if the DB is empty
  const templateCount = await db.templates.count();
  if (templateCount > 0) return;

  const now = Date.now();

  // Minimal: 1 exercise + 1 track + 1 template + 1 template item
  const exerciseId = uuid();
  const trackId = uuid();
  const templateId = uuid();

  await db.transaction(
    "rw",
    db.exercises,
    db.tracks,
    db.templates,
    db.templateItems,
    async () => {
      await db.exercises.add({
        id: exerciseId,
        name: "Test Exercise",
        equipmentTags: ["barbell"],
        createdAt: now,
      });

      await db.tracks.add({
        id: trackId,
        exerciseId,
        trackType: "strength",
        displayName: "Test Track",
        trackingMode: "weightedReps",
        warmupSetsDefault: 2,
        workingSetsDefault: 2,
        repMin: 5,
        repMax: 8,
        restSecondsDefault: 120,
        weightJumpDefault: 5,
        createdAt: now,
      });

      await db.templates.add({
        id: templateId,
        name: "E2E Template",
        createdAt: now,
      });

      await db.templateItems.add({
        id: uuid(),
        templateId,
        orderIndex: 0,
        trackId,
        createdAt: now,
      });
    }
  );
}
