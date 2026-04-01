export function safeParsePrsCount(prsJson?: string): number {
  if (!prsJson) return 0;
  try {
    const v = JSON.parse(prsJson);
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") {
      if (Array.isArray((v as any).hits)) return (v as any).hits.length;
      const arrs = Object.values(v).filter((x) => Array.isArray(x)) as any[];
      if (arrs.length === 1) return arrs[0].length;
    }
    return 0;
  } catch {
    return 0;
  }
}
