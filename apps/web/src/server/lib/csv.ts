/**
 * One CSV cell. Quotes values containing a comma, quote or line break, and
 * neutralises spreadsheet formulas: a cell starting with = + - @ tab or CR is
 * prefixed with ' so Excel/Sheets show it as text instead of evaluating it
 * (titles, referrers and user agents arrive from public /api/track calls).
 */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
