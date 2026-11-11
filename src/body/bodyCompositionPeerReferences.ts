import type { PeerReferenceLandmark, PeerReferenceViewModel } from "../components/charts/PeerReferenceStrip";

const LB_TO_KG = 0.45359237;
const IN_TO_M = 0.0254;
const IN_TO_CM = 2.54;

type ReferenceProfile = {
  peerGroupLabel: string;
  sourceLabel: string;
  disclaimer: string;
  landmarks: readonly PeerReferenceLandmark[];
};

export const MEN_50_59_FMI_REFERENCE: ReferenceProfile = Object.freeze({
  peerGroupLabel: "Men 50–59",
  sourceLabel: "Fat Mass Index",
  disclaimer: "GE DXA reference from Imboden et al., PLOS ONE 2017 (doi:10.1371/journal.pone.0175110); population context only, not a clinical assessment.",
  landmarks: Object.freeze([
    { percentile: 10, value: 4.7 }, { percentile: 20, value: 5.9 }, { percentile: 30, value: 6.7 },
    { percentile: 40, value: 7.8 }, { percentile: 50, value: 8.7 }, { percentile: 60, value: 9.4 },
    { percentile: 70, value: 10.3 }, { percentile: 80, value: 11.7 }, { percentile: 90, value: 13.4 },
  ]),
});

export const MEN_50_59_LMI_REFERENCE: ReferenceProfile = Object.freeze({
  peerGroupLabel: "Men 50–59",
  sourceLabel: "Lean Mass Index",
  disclaimer: "GE DXA reference from Imboden et al., PLOS ONE 2017 (doi:10.1371/journal.pone.0176161); population context only, not a clinical assessment.",
  landmarks: Object.freeze([
    { percentile: 10, value: 16.3 }, { percentile: 20, value: 17.2 }, { percentile: 30, value: 17.8 },
    { percentile: 40, value: 18.3 }, { percentile: 50, value: 18.8 }, { percentile: 60, value: 19.4 },
    { percentile: 70, value: 20.1 }, { percentile: 80, value: 20.8 }, { percentile: 90, value: 21.6 },
  ]),
});

export const MEN_50_59_WAIST_REFERENCE_CM: ReferenceProfile = Object.freeze({
  peerGroupLabel: "Men 50–59",
  sourceLabel: "Waist circumference",
  disclaimer: "NCHS/NHANES August 2021–August 2023, Table 12; population context only, not a clinical assessment.",
  landmarks: Object.freeze([
    { percentile: 5, value: 83.2 }, { percentile: 10, value: 88.2 }, { percentile: 15, value: 90.5 },
    { percentile: 25, value: 94.2 }, { percentile: 50, value: 104.3 }, { percentile: 75, value: 114.8 },
    { percentile: 85, value: 123.4 }, { percentile: 90, value: 128.4 }, { percentile: 95, value: 137.0 },
  ]),
});

export function massIndexFromPounds(massLb: number, heightIn: number): number | undefined {
  if (!Number.isFinite(massLb) || !Number.isFinite(heightIn) || massLb <= 0 || heightIn <= 0) return undefined;
  const heightM = heightIn * IN_TO_M;
  return massLb * LB_TO_KG / (heightM * heightM);
}

export function resolveReferenceBracket(value: number, landmarks: readonly PeerReferenceLandmark[]): string {
  const ordered = [...landmarks].sort((a, b) => a.value - b.value);
  if (value < ordered[0].value) return `below ${ordered[0].percentile}th percentile`;
  for (let index = 1; index < ordered.length; index += 1) {
    if (value <= ordered[index].value) return `between ${ordered[index - 1].percentile}th and ${ordered[index].percentile}th percentile`;
  }
  return `${ordered[ordered.length - 1].percentile}th percentile or above`;
}

function indexViewModel(value: number, profile: ReferenceProfile, metric: "FMI" | "LMI", corrected = false): PeerReferenceViewModel {
  return {
    title: `Peer-group reference · ${metric}`,
    peerGroupLabel: profile.peerGroupLabel,
    currentValue: value,
    currentValueLabel: `${value.toFixed(1)} kg/m²`,
    currentMetricLabel: corrected ? "Current corrected LMI" : `Current ${metric}`,
    percentileBracket: resolveReferenceBracket(value, profile.landmarks),
    landmarks: [...profile.landmarks],
    sourceLabel: corrected ? "LMI from corrected lean mass" : profile.sourceLabel,
    disclaimer: profile.disclaimer,
    landmarkValueLabel: (landmark) => `${landmark.toFixed(1)} kg/m²`,
    categoryLabels: [`Lower ${metric}`, "Middle range", `Higher ${metric}`],
  };
}

export function buildFatMassIndexPeerReference(fatMassLb: number, heightIn: number): PeerReferenceViewModel | undefined {
  const fmi = massIndexFromPounds(fatMassLb, heightIn);
  return fmi == null ? undefined : indexViewModel(fmi, MEN_50_59_FMI_REFERENCE, "FMI");
}

export function buildLeanMassIndexPeerReference(leanMassLb: number, heightIn: number, corrected = false): PeerReferenceViewModel | undefined {
  const lmi = massIndexFromPounds(leanMassLb, heightIn);
  return lmi == null ? undefined : indexViewModel(lmi, MEN_50_59_LMI_REFERENCE, "LMI", corrected);
}

export function buildWaistPeerReference(waistIn: number): PeerReferenceViewModel | undefined {
  if (!Number.isFinite(waistIn) || waistIn <= 0) return undefined;
  const waistCm = waistIn * IN_TO_CM;
  return {
    title: "Peer-group reference · Waist",
    peerGroupLabel: MEN_50_59_WAIST_REFERENCE_CM.peerGroupLabel,
    currentValue: waistCm,
    currentValueLabel: `${waistIn.toFixed(1)} in`,
    currentMetricLabel: "Current waist",
    percentileBracket: resolveReferenceBracket(waistCm, MEN_50_59_WAIST_REFERENCE_CM.landmarks),
    landmarks: [...MEN_50_59_WAIST_REFERENCE_CM.landmarks],
    sourceLabel: MEN_50_59_WAIST_REFERENCE_CM.sourceLabel,
    disclaimer: MEN_50_59_WAIST_REFERENCE_CM.disclaimer,
    landmarkValueLabel: (value) => `${value.toFixed(1)} cm`,
    categoryLabels: ["Lower circumference", "Middle range", "Higher circumference"],
  };
}
