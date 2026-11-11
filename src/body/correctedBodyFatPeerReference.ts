import type { PeerReferenceViewModel } from "../components/charts/PeerReferenceStrip";

export const MEN_51_59_DXA_BODY_FAT_REFERENCE = Object.freeze({
  peerGroupLabel: "Men 51–59",
  sourceLabel: "Prototype reference",
  disclaimer: "Approximate NHANES DXA reference; population context only, not a clinical assessment.",
  landmarks: Object.freeze([
    { percentile: 5, value: 11.5 },
    { percentile: 10, value: 14.9 },
    { percentile: 25, value: 19.1 },
    { percentile: 50, value: 24.4 },
    { percentile: 75, value: 29.3 },
    { percentile: 90, value: 36.6 },
    { percentile: 95, value: 44.4 },
  ]),
});

export function resolvePercentileBracket(value: number): string {
  const points = MEN_51_59_DXA_BODY_FAT_REFERENCE.landmarks;
  if (value < points[0].value) return "below 5th percentile";
  for (let index = 1; index < points.length; index += 1) {
    if (value <= points[index].value) {
      return `between ${points[index - 1].percentile}th and ${points[index].percentile}th percentile`;
    }
  }
  return "95th percentile or above";
}

export function buildCorrectedBodyFatPeerReference(value: number): PeerReferenceViewModel | undefined {
  if (!Number.isFinite(value)) return undefined;
  return {
    title: "Peer-group reference",
    peerGroupLabel: MEN_51_59_DXA_BODY_FAT_REFERENCE.peerGroupLabel,
    currentValue: value,
    currentValueLabel: `${value.toFixed(1)}%`,
    positionLabel:
      value < MEN_51_59_DXA_BODY_FAT_REFERENCE.landmarks[3].value
        ? "below median"
        : value > MEN_51_59_DXA_BODY_FAT_REFERENCE.landmarks[3].value
          ? "above median"
          : "at median",
    percentileBracket: resolvePercentileBracket(value),
    landmarks: [...MEN_51_59_DXA_BODY_FAT_REFERENCE.landmarks],
    sourceLabel: MEN_51_59_DXA_BODY_FAT_REFERENCE.sourceLabel,
    disclaimer: MEN_51_59_DXA_BODY_FAT_REFERENCE.disclaimer,
  };
}
