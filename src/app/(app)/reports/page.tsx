import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { createClient } from '@/lib/supabase/server';
import { isDateStr, todayStr } from '@/lib/time';
import { fetchReport, REPORT_TYPES, reportCells, RH, type ReportType } from '@/lib/reports';
import { SHIFTS, SHIFT_LABEL } from '@/lib/types';
import { Table } from '@/components/ui';
import { PrintButton } from './print-button';

type SP = { type?: string; date?: string; shift?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const p = await requireProfile();
  const sp = await searchParams;
  const type: ReportType = REPORT_TYPES.find((t) => t === sp.type) ?? 'Daily log';
  // No ?date= at all => today for the daily log; an explicitly empty date => all dates
  const date = sp.date === undefined ? (type === 'Daily log' ? todayStr() : '') : isDateStr(sp.date) ? sp.date : '';
  const shift = (SHIFTS as readonly string[]).includes(sp.shift ?? '') ? (sp.shift as string) : '';

  const rows = await fetchReport(await createClient(), type, date, shift);
  const qs = new URLSearchParams({ type, date, shift }).toString();

  return (
    <>
      <h1>Reports</h1>
      <form className="r" method="get">
        <select name="type" defaultValue={type}>{REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <input type="date" name="date" defaultValue={date} />
        <select name="shift" defaultValue={shift}>
          <option value="">All shifts</option>
          {SHIFTS.map((s) => <option key={s} value={s}>{SHIFT_LABEL[s]}</option>)}
        </select>
        <button className="s">Apply</button>
        {can(p.role, 'export') && <a className="btn" href={`/api/export?${qs}`}>Download CSV</a>}
        <PrintButton />
      </form>
      <div className="c">
        <Table head={RH} rows={rows.map(reportCells)} />
        {rows.length >= 5000 && <p className="note">Showing the latest 5,000 rows. Narrow the filters.</p>}
      </div>
      <p className="note">Exports respect the filters above. The shift filter matches the shift the device was issued on.</p>
    </>
  );
}
