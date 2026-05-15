export function pluralizeWalk(count: number) {
  return `${count} walk${count === 1 ? "" : "s"}`;
}

export function formatCardioDuration(seconds?: number) {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes <= 90) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatCardioDistanceMeters(meters?: number) {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return "";
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

export function formatCardioPace(secondsPerMile?: number) {
  if (secondsPerMile == null || !Number.isFinite(secondsPerMile) || secondsPerMile <= 0) return "";
  const rounded = Math.round(secondsPerMile);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}/mi`;
}

export function formatCardioWalkDateTime(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
