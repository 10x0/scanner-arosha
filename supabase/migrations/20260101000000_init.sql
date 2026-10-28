-- Scanner Management System: schema, RLS, and business rules.
-- All writes go through the SECURITY DEFINER functions below (role-checked, transactional, audited).
-- The browser/server clients only get SELECT on tables.

create schema if not exists private;

-- ───────────────────────── Tables ─────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  username    text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  role        text not null check (role in ('administrator','supervisor','operator','auditor')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.devices (
  id          uuid primary key default gen_random_uuid(),
  device_no   text not null check (length(trim(device_no)) > 0),
  type        text not null default 'PDA',
  serial      text not null default '',
  status      text not null default 'Available'
              check (status in ('Available','Issued','Damaged','Maintenance','Missing','Retired')),
  condition   text not null default 'Good',
  notes       text not null default '',
  created_at  timestamptz not null default now()
);
create unique index devices_no_key on public.devices (lower(device_no));

create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  emp_no      text not null default '',
  name        text not null check (length(trim(name)) > 0),
  dept        text not null default '',
  shift       text not null default '' check (shift in ('','Morning','Afternoon','Night')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index staff_emp_key on public.staff (lower(emp_no)) where emp_no <> '';

create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  batch_ref        text,
  device_id        uuid not null references public.devices (id),
  staff_id         uuid not null references public.staff (id),
  device_no        text not null,           -- snapshots so history survives renames
  staff_name       text not null,
  shift            text not null default '',
  issued_at        timestamptz not null default now(),
  issued_by        uuid references public.profiles (id),
  issued_by_name   text not null,
  notes            text not null default '',
  returned_at      timestamptz,
  received_by      uuid references public.profiles (id),
  received_by_name text,
  return_condition text check (return_condition in ('Good','Damaged','Faulty')),
  return_notes     text not null default ''
);
-- Hard guarantee: a device can never have two active assignments.
create unique index one_active_assignment on public.transactions (device_id) where returned_at is null;
create index tx_issued_idx   on public.transactions (issued_at desc);
create index tx_returned_idx on public.transactions (returned_at);
create index tx_staff_idx    on public.transactions (staff_id) where returned_at is null;

create table public.damage_reports (
  id                uuid primary key default gen_random_uuid(),
  device_id         uuid not null references public.devices (id),
  device_no         text not null,
  reported_at       timestamptz not null default now(),
  reported_by       uuid references public.profiles (id),
  reported_by_name  text not null,
  last_user         text,
  category          text not null default 'Other',
  severity          text not null default 'Medium' check (severity in ('Low','Medium','High')),
  description       text not null default '',
  status            text not null default 'Reported'
                    check (status in ('Reported','Under Inspection','Awaiting Repair','Under Repair','Repaired','Beyond Repair')),
  repaired_by       text,
  repaired_at       timestamptz,
  repair_note       text not null default ''
);
create index damage_dev_idx on public.damage_reports (device_id);

create table public.stock_checks (
  id               uuid primary key default gen_random_uuid(),
  checked_at       timestamptz not null default now(),
  checked_by       uuid references public.profiles (id),
  checked_by_name  text not null,
  note             text not null
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  user_name  text not null,
  role       text,
  action     text not null,
  record     text not null default '',
  reason     text not null default ''
);
create index audit_at_idx on public.audit_log (at desc);

-- audit_log is append-only, even for the service role
create or replace function private.deny_change() returns trigger
language plpgsql as $$ begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_no_change before update or delete on public.audit_log
  for each row execute function private.deny_change();
create trigger audit_no_truncate before truncate on public.audit_log
  for each statement execute function private.deny_change();

-- Never let the last active administrator be demoted or deactivated
create or replace function private.keep_one_admin() returns trigger
language plpgsql as $$
begin
  if old.role = 'administrator' and old.active
     and (new.role <> 'administrator' or not new.active)
     and not exists (select 1 from public.profiles
                     where role = 'administrator' and active and id <> old.id) then
    raise exception 'Keep at least one active administrator';
  end if;
  return new;
end $$;
create trigger profiles_keep_admin before update on public.profiles
  for each row execute function private.keep_one_admin();

-- ───────────────────────── Helpers ─────────────────────────

create or replace function private.role_can(p_role text, p_action text) returns boolean
language sql immutable as $$
  select case p_role
    when 'administrator' then p_action in ('issue','bulk','damage','repair','manage','missing','export','adjust')
    when 'supervisor'    then p_action in ('issue','bulk','damage','repair','export')
    when 'operator'      then p_action in ('issue','bulk','damage')
    when 'auditor'       then p_action in ('export')
    else false end
$$;

-- Returns the caller's active profile, or raises if not allowed to perform p_action
create or replace function private.require_perm(p_action text) returns public.profiles
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid() and active;
  if p.id is null then
    raise exception 'Not signed in or account inactive' using errcode = '42501';
  end if;
  if not private.role_can(p.role, p_action) then
    raise exception 'Permission denied for role %', p.role using errcode = '42501';
  end if;
  return p;
end $$;

create or replace function private.write_audit(p public.profiles, p_action text, p_record text, p_reason text default '')
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_log (user_id, user_name, role, action, record, reason)
  values (p.id, p.name, p.role, p_action, p_record, coalesce(p_reason, ''));
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

-- ───────────────────────── Row Level Security ─────────────────────────

alter table public.profiles       enable row level security;
alter table public.devices        enable row level security;
alter table public.staff          enable row level security;
alter table public.transactions   enable row level security;
alter table public.damage_reports enable row level security;
alter table public.stock_checks   enable row level security;
alter table public.audit_log      enable row level security;

create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid());
create policy devices_read  on public.devices        for select to authenticated using ((select public.is_active_user()));
create policy staff_read    on public.staff          for select to authenticated using ((select public.is_active_user()));
create policy tx_read       on public.transactions   for select to authenticated using ((select public.is_active_user()));
create policy damage_read   on public.damage_reports for select to authenticated using ((select public.is_active_user()));
create policy checks_read   on public.stock_checks   for select to authenticated using ((select public.is_active_user()));
create policy audit_read    on public.audit_log      for select to authenticated using ((select public.is_active_user()));

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

-- ───────────────────────── Business functions ─────────────────────────

-- Issue one or many devices to one staff member. All-or-nothing.
create or replace function public.issue_devices(
  p_device_nos text[], p_staff_id uuid, p_notes text default '', p_batch text default null)
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

  select * into s from staff where id = p_staff_id and active;
  if s.id is null then raise exception 'Select an active staff member'; end if;

  foreach n in array p_device_nos loop
    n := trim(n);
    if lower(n) = any (seen) then raise exception '%: duplicate in batch', n; end if;
    seen := seen || lower(n);

    select * into d from devices where lower(device_no) = lower(n) for update;
    if d.id is null then raise exception '%: not registered', n; end if;
    if d.status <> 'Available' then raise exception '%: unavailable (%)', d.device_no, d.status; end if;

    insert into transactions (batch_ref, device_id, staff_id, device_no, staff_name, shift,
                              issued_by, issued_by_name, notes)
    values (p_batch, d.id, s.id, d.device_no, s.name, s.shift, me.id, me.name, coalesce(p_notes, ''));
    update devices set status = 'Issued' where id = d.id;

    perform private.write_audit(me, 'ISSUE',
      d.device_no || ' → ' || s.name || case when p_batch is not null then ' [' || p_batch || ']' else '' end);
    cnt := cnt + 1;
  end loop;

  if p_batch is not null then
    perform private.write_audit(me, 'BATCH ISSUE', p_batch || ' (' || cnt || ' devices)');
  end if;
end $$;

-- Return one or many devices. p_items = [{"no":"SC-001","cond":"Good|Damaged|Faulty"}]
create or replace function public.return_devices(
  p_items jsonb, p_notes text default '', p_batch text default null)
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
       set returned_at = now(), received_by = me.id, received_by_name = me.name,
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
      d.device_no || ' (' || c || ')' || case when p_batch is not null then ' [' || p_batch || ']' else '' end);
    cnt := cnt + 1;
  end loop;

  if p_batch is not null then
    perform private.write_audit(me, 'BATCH RETURN', p_batch || ' (' || cnt || ' devices)');
  end if;
end $$;

-- Dry-run validation for the bulk screen. Returns [{"no":..., "error":null|"..."}]
create or replace function public.check_batch(p_mode text, p_nos text[], p_staff uuid default null)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  n    text;
  d    public.devices;
  seen text[] := '{}';
  err  text;
  res  jsonb := '[]'::jsonb;
  staff_ok boolean := false;
begin
  if not public.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_mode = 'Issue' then
    staff_ok := exists (select 1 from staff where id = p_staff and active);
  end if;

  foreach n in array p_nos loop
    n := trim(n);
    err := null;
    select * into d from devices where lower(device_no) = lower(n);

    if lower(n) = any (seen) then
      err := 'Duplicate';
    elsif d.id is null then
      err := 'Not registered';
    elsif p_mode = 'Issue' then
      if not staff_ok then err := 'Select a staff member';
      elsif d.status <> 'Available' then err := 'Unavailable (' || d.status || ')';
      elsif exists (select 1 from transactions where device_id = d.id and returned_at is null) then
        err := 'Already has an active assignment';
      end if;
    else
      if not exists (select 1 from transactions where device_id = d.id and returned_at is null) then
        err := 'No active assignment';
      end if;
    end if;

    seen := seen || lower(n);
    res := res || jsonb_build_array(jsonb_build_object('no', coalesce(d.device_no, n), 'error', err));
  end loop;
  return res;
end $$;

create or replace function public.report_damage(
  p_device_no text, p_category text, p_severity text, p_desc text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me public.profiles := private.require_perm('damage');
  d  public.devices;
  lu text;
begin
  select * into d from devices where lower(device_no) = lower(trim(p_device_no)) for update;
  if d.id is null then raise exception 'Unknown device'; end if;
  if exists (select 1 from transactions where device_id = d.id and returned_at is null) then
    raise exception 'Device is issued – return it as Damaged instead';
  end if;
  if d.status in ('Missing','Retired') then
    raise exception '%: cannot report damage on a % device', d.device_no, d.status;
  end if;
  if length(trim(coalesce(p_desc, ''))) = 0 then raise exception 'Describe the problem'; end if;
  if p_severity not in ('Low','Medium','High') then raise exception 'Invalid severity'; end if;

  select staff_name into lu from transactions where device_id = d.id order by issued_at desc limit 1;
  update devices set status = 'Damaged', condition = 'Damaged' where id = d.id;
  insert into damage_reports (device_id, device_no, reported_by, reported_by_name, last_user,
                              category, severity, description)
  values (d.id, d.device_no, me.id, me.name, lu, coalesce(nullif(p_category, ''), 'Other'), p_severity, trim(p_desc));
  perform private.write_audit(me, 'DAMAGE REPORT', d.device_no || ' – ' || p_category);
end $$;

create or replace function public.put_under_repair(p_device_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me public.profiles := private.require_perm('repair');
  d  public.devices;
  lu text;
begin
  select * into d from devices where id = p_device_id for update;
  if d.id is null then raise exception 'Unknown device'; end if;
  if exists (select 1 from transactions where device_id = d.id and returned_at is null) then
    raise exception 'Device is issued – return it first';
  end if;
  if d.status not in ('Available','Damaged') then
    raise exception 'Only Available or Damaged devices can be put under repair';
  end if;

  update devices set status = 'Maintenance' where id = d.id;
  update damage_reports set status = 'Under Repair'
   where id = (select id from damage_reports
                where device_id = d.id and status not in ('Repaired','Beyond Repair')
                order by reported_at desc limit 1);
  if not found then
    select staff_name into lu from transactions where device_id = d.id order by issued_at desc limit 1;
    insert into damage_reports (device_id, device_no, reported_by, reported_by_name, last_user,
                                description, status)
    values (d.id, d.device_no, me.id, me.name, lu,
            coalesce(nullif(trim(p_reason), ''), 'Put under repair'), 'Under Repair');
  end if;
  perform private.write_audit(me, 'UNDER REPAIR', d.device_no, coalesce(nullif(trim(p_reason), ''), '—'));
end $$;

create or replace function public.set_repair_status(
  p_report_id uuid, p_status text, p_repaired_by text default null, p_note text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me public.profiles := private.require_perm('repair');
  r  public.damage_reports;
  d  public.devices;
begin
  if p_status not in ('Reported','Under Inspection','Awaiting Repair','Under Repair','Repaired','Beyond Repair') then
    raise exception 'Invalid status';
  end if;
  select * into r from damage_reports where id = p_report_id for update;
  if r.id is null then raise exception 'Report not found'; end if;
  if r.status in ('Repaired','Beyond Repair') then raise exception 'This report is already closed'; end if;
  select * into d from devices where id = r.device_id for update;
  if d.status in ('Missing','Retired') then raise exception '%: device is %', d.device_no, d.status; end if;
  if p_status = 'Repaired' and length(trim(coalesce(p_repaired_by, ''))) = 0 then
    raise exception 'Enter who repaired the device';
  end if;

  update damage_reports set
    status      = p_status,
    repaired_by = case when p_status = 'Repaired' then trim(p_repaired_by) else repaired_by end,
    repaired_at = case when p_status = 'Repaired' then now() else repaired_at end,
    repair_note = case when p_status = 'Repaired' then coalesce(p_note, '') else repair_note end
  where id = r.id;

  if p_status = 'Repaired' then
    update devices set status = 'Available', condition = 'Good' where id = d.id;
  elsif p_status = 'Beyond Repair' then
    update devices set status = 'Retired' where id = d.id;
  else
    update devices set status = 'Maintenance' where id = d.id;
  end if;
  perform private.write_audit(me, 'DAMAGE ' || upper(p_status), r.device_no,
    case when p_status = 'Repaired' then 'repaired by ' || trim(p_repaired_by) else '' end);
end $$;

-- Declare Missing / Retire / mark a Missing device as found. Administrator only.
create or replace function public.set_device_status(p_device_id uuid, p_status text, p_reason text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me public.profiles := private.require_perm('missing');
  d  public.devices;
  has_tx boolean;
begin
  if p_status not in ('Missing','Retired','Available') then raise exception 'Invalid status'; end if;
  select * into d from devices where id = p_device_id for update;
  if d.id is null then raise exception 'Unknown device'; end if;
  has_tx := exists (select 1 from transactions where device_id = d.id and returned_at is null);

  if p_status = 'Retired' and has_tx then raise exception '%: return the device before retiring it', d.device_no; end if;
  if p_status = 'Available' and (d.status <> 'Missing' or has_tx) then
    raise exception '%: only a Missing device with no open assignment can be marked found', d.device_no;
  end if;
  if d.status in ('Retired') then raise exception '%: device is retired', d.device_no; end if;

  update devices set status = p_status,
         condition = case when p_status = 'Available' then 'Good' else condition end
   where id = d.id;
  perform private.write_audit(me, 'STATUS ' || upper(p_status), d.device_no, coalesce(nullif(trim(p_reason), ''), '—'));
end $$;

create or replace function public.add_device(p_no text, p_type text, p_serial text default '', p_notes text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('manage');
begin
  if length(trim(coalesce(p_no, ''))) = 0 then raise exception 'Enter a device number'; end if;
  if exists (select 1 from devices where lower(device_no) = lower(trim(p_no))) then
    raise exception 'Duplicate device number';
  end if;
  insert into devices (device_no, type, serial, notes)
  values (trim(p_no), coalesce(nullif(trim(p_type), ''), 'PDA'), trim(coalesce(p_serial, '')), trim(coalesce(p_notes, '')));
  perform private.write_audit(me, 'DEVICE ADD', trim(p_no));
end $$;

create or replace function public.add_staff(p_name text, p_emp text default '', p_dept text default '', p_shift text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('manage');
begin
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Name required'; end if;
  if coalesce(p_shift, '') not in ('','Morning','Afternoon','Night') then raise exception 'Invalid shift'; end if;
  if length(trim(coalesce(p_emp, ''))) > 0
     and exists (select 1 from staff where lower(emp_no) = lower(trim(p_emp))) then
    raise exception 'Employee number already used';
  end if;
  insert into staff (name, emp_no, dept, shift)
  values (trim(p_name), trim(coalesce(p_emp, '')), trim(coalesce(p_dept, '')), coalesce(p_shift, ''));
  perform private.write_audit(me, 'STAFF ADD', trim(p_name));
end $$;

create or replace function public.set_staff_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('manage'); s public.staff;
begin
  update staff set active = p_active where id = p_id returning * into s;
  if s.id is null then raise exception 'Staff member not found'; end if;
  perform private.write_audit(me, case when p_active then 'STAFF ACTIVATE' else 'STAFF DEACTIVATE' end, s.name);
end $$;

create or replace function public.record_stock_check(p_note text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('missing'); v_note text := coalesce(nullif(trim(p_note), ''), 'No discrepancies');
begin
  insert into stock_checks (checked_by, checked_by_name, note) values (me.id, me.name, v_note);
  perform private.write_audit(me, 'STOCK CHECK', v_note);
end $$;

create or replace function public.log_export(p_name text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.profiles := private.require_perm('export');
begin
  perform private.write_audit(me, 'EXPORT', p_name);
end $$;

-- Dashboard numbers. p_from/p_to = start/end of "today" in the app timezone.
create or replace function public.dashboard_stats(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'registered', (select count(*) from devices),
    'status',     (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
                     from (select status, count(*) c from devices group by status) x),
    'overdue',    (select count(*) from transactions where returned_at is null and issued_at < p_from),
    'staff_today',(select count(distinct staff_id) from transactions where issued_at >= p_from and issued_at < p_to),
    'out_today',  (select count(*) from transactions where issued_at >= p_from and issued_at < p_to),
    'back_today', (select count(*) from transactions where returned_at >= p_from and returned_at < p_to)
  )
$$;

-- First-run only: creates the very first administrator profile. Service role only.
create or replace function public.bootstrap_admin(p_id uuid, p_name text, p_username text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  perform pg_advisory_xact_lock(884201);
  insert into profiles (id, name, username, role)
  select p_id, trim(p_name), p_username, 'administrator'
  where not exists (select 1 from profiles);
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  insert into audit_log (user_id, user_name, role, action, record)
  values (p_id, trim(p_name), 'administrator', 'ADMIN CREATED', trim(p_name));
  return true;
end $$;

-- ───────────────────────── Function privileges ─────────────────────────

revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.bootstrap_admin(uuid, text, text) from authenticated;
