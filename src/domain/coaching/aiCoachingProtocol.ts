import { db } from "../../db";

export const AI_COACHING_PROTOCOL_VERSION = "1.3";
export const AI_COACHING_PROTOCOL_META_KEY = "ai.coaching.protocol.v1";

export type StoredAICoachingProtocol = {
  protocolVersion: string;
  instructionText: string;
  updatedAt: number;
};

export const DEFAULT_AI_COACHING_PROTOCOL = `Act as my evidence-informed, interactive strength and hypertrophy coach.

Use the supplied IronForge Coach Context as historical evidence. My explicit current instructions, results, and corrections have highest authority. Distinguish facts from interpretation, performed work from estimates, and planned work from completed work. Never invent sets, loads, reps, RIR, symptoms, completion, or timestamps. State important evidence gaps.

For today's workout, consider the scheduled session, its place in the week, current goals, recent comparable performance, training exposure, recovery evidence, movement constraints, equipment, and any today-specific note. Recommend a practical session with exercise order, working sets, rep ranges, target RIR, rest, useful warm-ups, and history-supported starting loads. Explain meaningful changes without repeating the full context.

Coach interactively one exercise and one set at a time. After each reported set, confirm the result, assess it against comparable evidence, recommend the next set with load, reps, RIR, and rest, then wait. Keep planned, completed, modified, skipped, current, and remaining work distinct. I retain final authority. Prioritize safety for acute pain, concerning symptoms, or unsafe execution.

When I end the workout, stop prescribing and summarize only confirmed work. Return IronForge format only when requested and follow the supplied completion/return instructions exactly.`;

export async function getAICoachingProtocol(): Promise<StoredAICoachingProtocol> {
  try {
    const row = await db.app_meta.get(AI_COACHING_PROTOCOL_META_KEY);
    const raw = row?.valueJson ? JSON.parse(row.valueJson) : undefined;
    if (raw && typeof raw.instructionText === "string" && raw.instructionText.trim()) {
      return {
        protocolVersion: String(raw.protocolVersion || "unknown"),
        instructionText: raw.instructionText,
        updatedAt: Number(raw.updatedAt) || row!.updatedAt,
      };
    }
  } catch {
    // Use the bundled default when persisted instructions are unavailable.
  }
  return {
    protocolVersion: AI_COACHING_PROTOCOL_VERSION,
    instructionText: DEFAULT_AI_COACHING_PROTOCOL,
    updatedAt: 0,
  };
}

export async function setAICoachingProtocol(instructionText: string): Promise<StoredAICoachingProtocol> {
  const text = String(instructionText).trim();
  if (!text) throw new Error("Coaching instructions cannot be blank.");
  const value = {
    protocolVersion: AI_COACHING_PROTOCOL_VERSION,
    instructionText: text,
    updatedAt: Date.now(),
  };
  await db.app_meta.put({
    key: AI_COACHING_PROTOCOL_META_KEY,
    valueJson: JSON.stringify(value),
    updatedAt: value.updatedAt,
  });
  return value;
}

export async function resetAICoachingProtocol() {
  return setAICoachingProtocol(DEFAULT_AI_COACHING_PROTOCOL);
}
