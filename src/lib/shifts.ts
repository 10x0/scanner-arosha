import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { currentShift } from './time';

export type ShiftSettings = { day_start: string; night_start: string };

export const getShiftSettings = cache(async (): Promise<ShiftSettings> => {
  const sb = await createClient();
  const { data } = await sb.from('shift_settings').select('day_start,night_start').maybeSingle();
  return {
    day_start: (data?.day_start as string | undefined)?.slice(0, 5) ?? '06:00',
    night_start: (data?.night_start as string | undefined)?.slice(0, 5) ?? '18:00',
  };
});

/** The shift the forms should pre-select right now. */
export async function getDefaultShift(): Promise<'Day' | 'Night'> {
  const s = await getShiftSettings();
  return currentShift(s.day_start, s.night_start);
}
