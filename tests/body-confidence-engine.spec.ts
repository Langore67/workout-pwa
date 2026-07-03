import { expect, test } from "@playwright/test";
import { buildBodyConfidence } from "../src/body/bodyConfidenceEngine";

type ConfidenceInput = Parameters<typeof buildBodyConfidence>[0];

function buildConfidence(overrides: {
  bodyComp?: Partial<ConfidenceInput["bodyComp"]>;
  hydration?: Partial<ConfidenceInput["hydration"]>;
} = {}) {
  return buildBodyConfidence({
    bodyComp: {
      weight: { latest: 198, baseline14d: 201, delta14d: -3 },
      waist: { latest: 35.5, baseline14d: 36.1, delta14d: -0.6 },
      bodyFatPct: { latest: 16.2, baseline14d: 16.9, delta14d: -0.7 },
      leanMass: { latest: 154.1, baseline14d: 153.6, delta14d: 0.5 },
      visceralFat: { latest: 8.2, baseline14d: 8.4, delta14d: -0.2 },
      bodyweightDelta7d: -1.2,
      bodyweightDelta14d: -3,
      ...overrides.bodyComp,
    },
    hydration: {
      latestWaterPct: 57.2,
      confidenceLabel: "High Confidence",
      confidenceScore: 82,
      note: "Hydration signal is stable.",
      distortionLikely: false,
      ...overrides.hydration,
    },
  });
}

test("buildBodyConfidence returns high confidence when weight, waist, and impedance trends align", async () => {
  const confidence = buildConfidence();

  expect(confidence.overall).toBe("high");
  expect(confidence.weight).toBe("high");
  expect(confidence.waist).toBe("high");
  expect(confidence.hydration).toBe("high");
  expect(confidence.leanMass).toMatch(/high|moderate/);
  expect(confidence.bodyFat).toMatch(/high|moderate/);
  expect(confidence.supportingEvidence).toContain("Weight trend has recent data.");
  expect(confidence.supportingEvidence).toContain("Waist trend has recent data.");
  expect(confidence.supportingEvidence).toContain("Weight and waist are directionally aligned.");
  expect(confidence.cautionFlags).not.toContain("Hydration confidence is low.");
});

test("buildBodyConfidence lowers impedance confidence when hydration is low and body comp conflicts", async () => {
  const confidence = buildConfidence({
    bodyComp: {
      weight: { latest: 198, baseline14d: 202, delta14d: -4 },
      waist: { latest: 35.6, baseline14d: 36.2, delta14d: -0.6 },
      bodyFatPct: { latest: 17.1, baseline14d: 16.7, delta14d: 0.4 },
      leanMass: { latest: 152.7, baseline14d: 154.8, delta14d: -2.1 },
      bodyweightDelta7d: -2.8,
      bodyweightDelta14d: -4,
    },
    hydration: {
      latestWaterPct: 49.8,
      confidenceLabel: "Low Confidence",
      confidenceScore: 32,
      note: "Hydration signal is unstable.",
      distortionLikely: true,
    },
  });

  expect(confidence.hydration).toBe("low");
  expect(confidence.leanMass).toBe("low");
  expect(confidence.bodyFat).toBe("low");
  expect(confidence.overall).toBe("moderate");
  expect(confidence.cautionFlags).toContain("Hydration confidence is low.");
  expect(confidence.cautionFlags).toContain("Rapid bodyweight loss may distort impedance-derived metrics.");
  expect(confidence.cautionFlags).toContain("Lean mass estimate is hydration-sensitive.");
});

test("buildBodyConfidence lowers confidence when waist is missing", async () => {
  const confidence = buildConfidence({
    bodyComp: {
      waist: { latest: null, baseline14d: null, delta14d: null },
    },
  });

  expect(confidence.waist).toBe("low");
  expect(confidence.overall).not.toBe("high");
  expect(confidence.cautionFlags).toContain("Waist data is missing or sparse.");
});

test("buildBodyConfidence records aligned weight and waist evidence", async () => {
  const confidence = buildConfidence();

  expect(confidence.supportingEvidence).toContain("Weight and waist are directionally aligned.");
});

test("buildBodyConfidence flags conflicting impedance signals", async () => {
  const confidence = buildConfidence({
    bodyComp: {
      weight: { latest: 198, baseline14d: 202, delta14d: -4 },
      waist: { latest: 35.4, baseline14d: 36, delta14d: -0.6 },
      bodyFatPct: { latest: 17.5, baseline14d: 16.7, delta14d: 0.8 },
      leanMass: { latest: 152.5, baseline14d: 154.7, delta14d: -2.2 },
      bodyweightDelta7d: -2.6,
      bodyweightDelta14d: -4,
    },
    hydration: {
      latestWaterPct: 50.4,
      confidenceLabel: "Moderate Confidence",
      confidenceScore: 62,
      note: "Hydration signal is mixed.",
      distortionLikely: true,
    },
  });

  expect(confidence.leanMass).toBe("low");
  expect(confidence.bodyFat).toBe("low");
  expect(confidence.cautionFlags).toContain("Body fat and weight/waist trends disagree.");
  expect(confidence.cautionFlags).toContain("Impedance-derived body composition signals are conflicting.");
});
