import { TZ } from './env';

const pad = (n: number) => String(n).padStart(2, '0');

function tzOffsetMs(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const wallAsUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return wallAsUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** The instant a calendar day (YYYY-MM-DD) begins in the app timezone. */
function zonedDayStart(dateStr: string, tz = TZ): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wallMidnight = Date.UTC(y, m - 1, d);
  let t = wallMidnight - tzOffsetMs(new Date(wallMidnight), tz);
  t = wallMidnight - tzOffsetMs(new Date(t), tz); // second pass handles DST edges
  return new Date(t);
}

const nextDay = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-${pad(n.getUTCDate())}`;
};

export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
export const isDateStr = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function dayBounds(dateStr: string) {
  return { from: zonedDayStart(dateStr), to: zonedDayStart(nextDay(dateStr)) };
}

export const fmt = (t: string | null | undefined) =>
  t ? new Date(t).toLocaleString('en-GB', { timeZone: TZ }) : '—';
