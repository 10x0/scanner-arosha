/** RFC4180 CSV with spreadsheet-formula neutralisation (=,+,-,@ prefixes). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
