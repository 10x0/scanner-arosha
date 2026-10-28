-- OPTIONAL demo data (the POC's 12 devices + 5 staff). Skip this in production and
-- add your real devices/staff from the app (or bulk-insert from a CSV in the SQL editor).
insert into public.devices (device_no, type, notes)
select 'SC-' || lpad(i::text, 3, '0'), 'PDA', 'DEMO DATA' from generate_series(1, 12) i;

insert into public.staff (name, emp_no, dept, shift) values
  ('Amina Khan',  'E101', 'Sortation', 'Morning'),
  ('Tom Reid',    'E102', 'Sortation', 'Morning'),
  ('Lucia Gomez', 'E103', 'Sortation', 'Afternoon'),
  ('Ravi Patel',  'E104', 'Sortation', 'Night'),
  ('Sam O’Neil',  'E105', 'Sortation', 'Afternoon');
