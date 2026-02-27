export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function median(nums: number[]): number | undefined {
  const arr = nums.slice().sort((a,b)=>a-b);
  if (arr.length === 0) return undefined;
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 1) return arr[mid];
  return (arr[mid-1] + arr[mid]) / 2;
}

export function formatNum(n?: number, digits = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  const isInt = Math.abs(n - Math.round(n)) < 1e-9;
  return isInt ? String(Math.round(n)) : n.toFixed(digits);
}
