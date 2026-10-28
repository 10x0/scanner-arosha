import type { ReactNode } from 'react';

export function Table({ head, rows, empty = 'No records yet.' }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  return (
    <div className="t">
      <table>
        <thead>
          <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)
          ) : (
            <tr><td colSpan={head.length} className="l">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const Pill = ({ s }: { s: string }) => <span className={`p ${s}`}>{s}</span>;
