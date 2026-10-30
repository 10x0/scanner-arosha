-- Update 2: transfers, Day/Night shifts, admin-only delete/archive.
-- Incremental and non-destructive: adds columns/tables, preserves every existing row.

-- ───────────── Shift: Day / Night ─────────────
alter table public.transactions
  add column if not exists legacy_shift     text,                       -- original value of old Morning/Afternoon rows
  add column if not exists return_shift     text,
  add column if not exists end_type         text,
  add column if not exists transferred_from uuid references public.transactions (id),
  add column if not exists origin_tx        uuid references public.transactions (id),
  add column if not exists origin_batch     text;

update public.transactions set end_type = 'return' where returned_at is not null and end_type is null;
update public.transactions set legacy_shift = shift, shift = 'Day'
 where shift in ('Morning','Afternoon') and legacy_shift is null;

alter table public.transactions
  add constraint tx_end_type_chk     check (end_type is null or end_type in ('return','transfer')),
  add constraint tx_shift_chk        check (shift in ('','Day','Night')),
  add constraint tx_return_shift_chk check (return_shift is null or return_shift in ('Day','Night'));

alter table public.staff drop constraint if exists staff_shift_check;
alter table public.staff add constraint staff_shift_check
  check (shift in ('','Day','Night','Morning','Afternoon'));          -- legacy values stay valid

create table public.shift_settings (
  id          boolean primary key default true check (id),            -- single row
  day_start   time not null default '06:00',
  night_start time not null default '18:00'
);
insert into public.shift_settings default values;

-- ───────────── Transfers ─────────────
create table public.transfers (
  id                 uuid primary key default gen_random_uuid(),
  batch_ref          text,
  transferred_at     timestamptz not null default now(),
  device_id          uuid not null references public.devices (id),
  device_no          text not null,
  origin_staff_name  text not null,          -- who ORIGINALLY received it
  from_staff_id      uuid not null references public.staff (id),
  from_staff_name    text not null,
  to_staff_id        uuid not null references public.staff (id),
  to_staff_name      text not null,
  from_tx            uuid not null references public.transactions (id),
  to_tx              uuid not null references public.transactions (id),
  shift              text not null check (shift in ('Day','Night')),
  by_id              uuid references public.profiles (id),
  by_name            text not null,
  note               text not null default ''
);
create index transfers_at_idx     on public.transfers (transferred_at desc);
create index transfers_device_idx on public.transfers (device_id);

-- ───────────── Archiving ─────────────
alter table public.devices
  add column if not exists archived_at   timestamptz,
  add column if not exists archive_reason text not null default '';

-- ───────────── RLS / grants for new tables ─────────────
alter table public.transfers      enable row level security;
alter table public.shift_settings enable row level security;
create policy transfers_read on public.transfers      for select to authenticated using ((select public.is_active_user()));
create policy shifts_read    on public.shift_settings for select to authenticated using ((select public.is_active_user()));
revoke all on public.transfers, public.shift_settings from anon, authenticated;
grant select on public.transfers, public.shift_settings to authenticated;

-- ───────────── Permissions: add 'delete' (administrator only) ─────────────
create or replace function private.role_can(p_role text, p_action text) returns boolean
language sql immutable as $$
  select case p_role
    when 'administrator' then p_action in ('issue','bulk','damage','repair','manage','missing','export','adjust','delete')
    when 'supervisor'    then p_action in ('issue','bulk','damage','repair','export')
    when 'operator'      then p_action in ('issue','bulk','damage')
    when 'auditor'       then p_action in ('export')
    else false end
$$;

-- ───────────── Replace functions whose signatures changed ─────────────
drop function if exists public.issue_devices(text[], uuid, text, text);
drop function if exists public.return_devices(jsonb, text, text);
drop function if exists public.set_staff_active(uuid, boolean);

create or replace function public.issue_devices(
  p_device_nos text[], p_staff_id uuid, p_notes text default '', p_batch text default null, p_shift text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me   public.profiles := private.require_perm('issue');
  s    public.staff;
  d    public.devices;
  n    text;
  seen text[] := '{}';
  cnt  int := 0;
begin
  if coalesce(array_length(p_device_nos, 1), 0) = 0 then raise exception 'No devices supplied'; end if;
  if array_length(p_device_nos, 1) > 1 then perform private.require_perm('bulk'); end if;
  if coalesce(p_shift, '') not in ('Day','Night') then raise exception 'Select Day or Night shift'; end if;

  select * into s from staff where id = p_staff_id and active;
  if s.id is null then raise exception 'Select an active staff member'; end if;

  foreach n in array p_device_nos loop
    n := trim(n);
    if lower(n) = any (seen) then raise exception '%: duplicate in batch', n; end if;
    seen := seen || lower(n);

    select * into d from devices where lower(device_no) = lower(n) for update;
    if d.id is null then raise exception '%: not registered', n; end if;
    if d.status <> 'Available' then raise exception '%: unavailable (%)', d.device_no, d.status; end if;

    insert into transactions (batch_ref, origin_batch, device_id, staff_id, device_no, staff_name, shift,
                              issued_by, issued_by_name, notes)
    values (p_batch, p_batch, d.id, s.id, d.device_no, s.name, p_shift, me.id, me.name, coalesce(p_notes, ''));
    update devices set status = 'Issued' where id = d.id;

    perform private.write_audit(me, 'ISSUE',
      d.device_no || ' → ' || s.name || ' [' || p_shift || ']'
      || case when p_batch is not null then ' [' || p_batch || ']' else '' end);
    cnt := cnt + 1;
  end loop;

  if p_batch is not null then
    perform private.write_audit(me, 'BATCH ISSUE', p_batch || ' (' || cnt || ' devices, ' || p_shift || ')');
  end if;
end $$;

create or replace function public.return_devices(
  p_items jsonb, p_notes text default '', p_batch text default null, p_shift text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me   public.profiles := private.require_perm('issue');
  it   record;
  d    public.devices;
  t    public.transactions;
  n    text;
  c    text;
  seen text[] := '{}';
  cnt  int := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No devices supplied';
  end if;
  if jsonb_array_length(p_items) > 1 then perform private.require_perm('bulk'); end if;
  if coalesce(p_shift, '') not in ('Day','Night') then raise exception 'Select Day or Night shift'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    n := trim(coalesce(it.value ->> 'no', ''));
    c := coalesce(nullif(it.value ->> 'cond', ''), 'Good');
    if c not in ('Good','Damaged','Faulty') then raise exception '%: invalid condition', n; end if;
    if lower(n) = any (seen) then raise exception '%: duplicate in batch', n; end if;
    seen := seen || lower(n);

    select * into d from devices where lower(device_no) = lower(n) for update;
    if d.id is null then raise exception '%: not registered', n; end if;
    select * into t from transactions where device_id = d.id and returned_at is null;
    if t.id is null then raise exception '%: no active assignment', d.device_no; end if;

    update transactions
       set returned_at = now(), end_type = 'return', return_shift = p_shift,
           received_by = me.id, received_by_name = me.name,
           return_condition = c, return_notes = coalesce(p_notes, '')
     where id = t.id;

    if c = 'Good' then
      update devices set status = 'Available', condition = 'Good' where id = d.id;
    else
      update devices set status = 'Damaged', condition = c where id = d.id;
      insert into damage_reports (device_id, device_no, reported_by, reported_by_name, last_user,
                                  category, severity, description)
      values (d.id, d.device_no, me.id, me.name, t.staff_name, 'Other', 'Medium',
              'Returned ' || c || '. ' || coalesce(p_notes, ''));
    end if;

    perform private.write_audit(me, 'RETURN',
      d.device_no || ' (' || c || ') [' || p_shift || ']'
      || case when p_batch is not null then ' [' || p_batch || ']' else '' end);
    cnt := cnt + 1;
  end loop;

  if p_batch is not null then
    perform private.write_audit(me, 'BATCH RETURN', p_batch || ' (' || cnt || ' devices, ' || p_shift || ')');
  end if;
end $$;

-- ───────────── Transfer / reassign ─────────────
-- A transfer closes the current holder's assignment (end_type = 'transfer', NOT a return) and opens a linked
-- assignment for the new holder in the same transaction. origin_tx always points at the very first issue.
create or replace function public.transfer_devices(
  p_device_nos text[], p_to_staff uuid, p_shift text, p_note text default '', p_batch text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me     public.profiles := private.require_perm('issue');
  s      public.staff;
  d      public.devices;
  t      public.transactions;
  n      text;
  seen   text[] := '{}';
  cnt    int := 0;
  new_id uuid;
  origin text;
  last_from text;
begin
  if coalesce(array_length(p_device_nos, 1), 0) = 0 then raise exception 'No devices supplied'; end if;
  if array_length(p_device_nos, 1) > 1 then perform private.require_perm('bulk'); end if;
  if coalesce(p_shift, '') not in ('Day','Night') then raise exception 'Select Day or Night shift'; end if;

  select * into s from staff where id = p_to_staff and active;
  if s.id is null then raise exception 'Select an active staff member to transfer to'; end if;

  foreach n in array p_device_nos loop
    n := trim(n);
    if lower(n) = any (seen) then raise exception '%: duplicate in batch', n; end if;
    seen := seen || lower(n);

    select * into d from devices where lower(device_no) = lower(n) for update;
    if d.id is null then raise exception '%: not registered', n; end if;
    select * into t from transactions where device_id = d.id and returned_at is null;
    if t.id is null then raise exception '%: no active assignment', d.device_no; end if;
    if d.status <> 'Issued' then raise exception '%: cannot be transferred (status %)', d.device_no, d.status; end if;
    if t.staff_id = s.id then raise exception '%: already assigned to %', d.device_no, s.name; end if;

    select staff_name into origin from transactions where id = coalesce(t.origin_tx, t.id);

    update transactions
       set returned_at = now(), end_type = 'transfer', return_shift = p_shift,
           received_by = me.id, received_by_name = me.name, return_notes = coalesce(p_note, '')
     where id = t.id;

    insert into transactions (batch_ref, device_id, staff_id, device_no, staff_name, shift,
                              issued_by, issued_by_name, notes, transferred_from, origin_tx, origin_batch)
    values (p_batch, d.id, s.id, d.device_no, s.name, p_shift,
            me.id, me.name, coalesce(p_note, ''), t.id, coalesce(t.origin_tx, t.id),
            coalesce(t.origin_batch, t.batch_ref))
    returning id into new_id;

    insert into transfers (batch_ref, device_id, device_no, origin_staff_name, from_staff_id, from_staff_name,
                           to_staff_id, to_staff_name, from_tx, to_tx, shift, by_id, by_name, note)
    values (p_batch, d.id, d.device_no, origin, t.staff_id, t.staff_name,
            s.id, s.name, t.id, new_id, p_shift, me.id, me.name, coalesce(p_note, ''));

    perform private.write_audit(me, 'TRANSFER',
      d.device_no || ': ' || t.staff_name || ' → ' || s.name || ' [' || p_shift || ']'
      || case when p_batch is not null then ' [' || p_batch || ']' else '' end,
      coalesce(p_note, ''));
    last_from := t.staff_name;
    cnt := cnt + 1;
  end loop;

  if p_batch is not null then
    perform private.write_audit(me, 'BATCH TRANSFER', p_batch || ' (' || cnt || ' devices → ' || s.name || ', ' || p_shift || ')');
  end if;
end $$;

-- ───────────── Admin-only delete / archive / deactivate (with reason) ─────────────
create or replace function public.delete_device(p_device_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('delete'); d public.devices;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required'; end if;
  select * into d from devices where id = p_device_id for update;
  if d.id is null then raise exception 'Unknown device'; end if;
  if exists (select 1 from transactions where device_id = d.id and returned_at is null) then
    raise exception '%: has an active assignment and cannot be deleted', d.device_no;
  end if;
  if exists (select 1 from transactions where device_id = d.id)
     or exists (select 1 from damage_reports where device_id = d.id) then
    raise exception '%: has history and cannot be deleted. Archive it instead', d.device_no;
  end if;
  delete from devices where id = d.id;
  perform private.write_audit(me, 'DEVICE DELETE', d.device_no, trim(p_reason));
end $$;

create or replace function public.archive_device(p_device_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('delete'); d public.devices;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required'; end if;
  select * into d from devices where id = p_device_id for update;
  if d.id is null then raise exception 'Unknown device'; end if;
  if d.archived_at is not null then raise exception '%: already archived', d.device_no; end if;
  if exists (select 1 from transactions where device_id = d.id and returned_at is null) then
    raise exception '%: has an active assignment. Return it first', d.device_no;
  end if;
  update devices set status = 'Retired', archived_at = now(), archive_reason = trim(p_reason) where id = d.id;
  perform private.write_audit(me, 'DEVICE ARCHIVE', d.device_no, trim(p_reason));
end $$;

create or replace function public.delete_staff(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('delete'); s public.staff; held int;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required'; end if;
  select * into s from staff where id = p_id for update;
  if s.id is null then raise exception 'Staff member not found'; end if;
  select count(*) into held from transactions where staff_id = s.id and returned_at is null;
  if held > 0 then raise exception '%: currently holds % device(s) and cannot be deleted', s.name, held; end if;
  if exists (select 1 from transactions where staff_id = s.id)
     or exists (select 1 from transfers where from_staff_id = s.id or to_staff_id = s.id) then
    raise exception '%: has history and cannot be deleted. Deactivate instead', s.name;
  end if;
  delete from staff where id = s.id;
  perform private.write_audit(me, 'STAFF DELETE', s.name, trim(p_reason));
end $$;

create or replace function public.set_staff_active(p_id uuid, p_active boolean, p_reason text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('manage'); s public.staff; held int;
begin
  if not p_active and length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required'; end if;
  update staff set active = p_active where id = p_id returning * into s;
  if s.id is null then raise exception 'Staff member not found'; end if;
  select count(*) into held from transactions where staff_id = s.id and returned_at is null;
  perform private.write_audit(me, case when p_active then 'STAFF ACTIVATE' else 'STAFF DEACTIVATE' end,
    s.name || case when held > 0 then ' (still holds ' || held || ' device(s))' else '' end, trim(coalesce(p_reason, '')));
end $$;

-- ids of devices/staff that have history (used to decide Delete vs Archive/Deactivate in the UI)
create or replace function public.history_ids() returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'devices', (select coalesce(jsonb_agg(x), '[]'::jsonb) from
                 (select device_id x from transactions union select device_id from damage_reports) a),
    'staff',   (select coalesce(jsonb_agg(x), '[]'::jsonb) from
                 (select staff_id x from transactions union select from_staff_id from transfers
                  union select to_staff_id from transfers) b)
  )
$$;

-- ───────────── Shift settings ─────────────
create or replace function public.set_shift_times(p_day_start text, p_night_start text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('manage');
begin
  if p_day_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_night_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Enter times as HH:MM';
  end if;
  if p_day_start = p_night_start then raise exception 'Day and Night cannot start at the same time'; end if;
  update shift_settings set day_start = p_day_start::time, night_start = p_night_start::time;
  perform private.write_audit(me, 'SHIFT TIMES', 'Day from ' || p_day_start || ', Night from ' || p_night_start);
end $$;

-- ───────────── Updated existing functions (same signatures) ─────────────
create or replace function public.add_staff(p_name text, p_emp text default '', p_dept text default '', p_shift text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('manage');
begin
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Name required'; end if;
  if coalesce(p_shift, '') not in ('','Day','Night') then raise exception 'Invalid shift'; end if;
  if length(trim(coalesce(p_emp, ''))) > 0
     and exists (select 1 from staff where lower(emp_no) = lower(trim(p_emp))) then
    raise exception 'Employee number already used';
  end if;
  insert into staff (name, emp_no, dept, shift)
  values (trim(p_name), trim(coalesce(p_emp, '')), trim(coalesce(p_dept, '')), coalesce(p_shift, ''));
  perform private.write_audit(me, 'STAFF ADD', trim(p_name));
end $$;

create or replace function public.dashboard_stats(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'registered', (select count(*) from devices),
    'status',     (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
                     from (select status, count(*) c from devices group by status) x),
    'overdue',    (select count(*) from transactions where returned_at is null and issued_at < p_from),
    'staff_today',(select count(distinct staff_id) from transactions where issued_at >= p_from and issued_at < p_to),
    'out_today',  (select count(*) from transactions where issued_at >= p_from and issued_at < p_to and transferred_from is null),
    'back_today', (select count(*) from transactions where returned_at >= p_from and returned_at < p_to and end_type = 'return'),
    'transfers_today', (select count(*) from transfers where transferred_at >= p_from and transferred_at < p_to)
  )
$$;

-- ───────────── Re-apply function privileges (new functions default to PUBLIC execute) ─────────────
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.bootstrap_admin(uuid, text, text) from authenticated;
