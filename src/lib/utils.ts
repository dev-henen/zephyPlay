// src/lib/utils.ts
export function fmtTime(s: number) {
  if (!s || isNaN(s)) return "00:00";
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
