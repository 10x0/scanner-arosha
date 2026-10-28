'use client';
export function PrintButton() {
  return <button type="button" className="s" onClick={() => window.print()}>Print</button>;
}
