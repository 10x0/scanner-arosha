import { requireProfile } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getShiftSettings } from '@/lib/shifts';
import { currentShift } from '@/lib/time';
import { ShiftSettingsForm } from './settings-form';

export default async function SettingsPage() {
  const p = await requireProfile();
  if (!can(p.role, 'manage')) return <div className="c">Only administrators can change settings.</div>;
  const s = await getShiftSettings();
  return (
    <>
      <h1>Settings</h1>
      <div className="c">
        <h2>Shift times</h2>
        <p className="l">
          Day Shift runs from the Day start time until the Night start time; Night Shift covers the rest.
          Forms pre-select the current shift, and users can still switch it. Right now it is {currentShift(s.day_start, s.night_start)} shift.
        </p>
        <ShiftSettingsForm dayStart={s.day_start} nightStart={s.night_start} />
      </div>
    </>
  );
}
