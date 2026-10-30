-- Scenario test for the transfer / shift / delete rules. Runs as ONE statement and rolls itself back
-- (it raises at the end on purpose), so it leaves no data behind. Run it on a dev/scratch project,
-- in the Supabase SQL editor or: psql "$DATABASE_URL" -f supabase/tests/scenarios.sql
-- Success looks like an error whose message starts "ALL 10 SCENARIOS PASSED".
do $test$
declare
  admin_id uuid := '00000000-0000-0000-0000-0000000000a1';
  op_id    uuid := '00000000-0000-0000-0000-0000000000a2';
  s1 uuid := '00000000-0000-0000-0000-0000000000b1';
  s2 uuid := '00000000-0000-0000-0000-0000000000b2';
  s3 uuid := '00000000-0000-0000-0000-0000000000b3';
  s4 uuid := '00000000-0000-0000-0000-0000000000b4';
  n int; n2 int; failed boolean;
  nos text[];
begin
  -- fixtures (as the connecting superuser)
  insert into auth.users (id, email) values (admin_id, 'test-admin@test.local'), (op_id, 'test-op@test.local');
  insert into public.profiles (id, name, username, role) values
    (admin_id, 'Test Admin', 'test-admin', 'administrator'), (op_id, 'Test Operator', 'test-op', 'operator');
  insert into public.staff (id, name, emp_no) values
    (s1, 'Test Original', 'T1'), (s2, 'Test Second', 'T2'), (s3, 'Test Third', 'T3'), (s4, 'Test Unused', 'T4');
  insert into public.devices (device_no) select 'TST-' || lpad(i::text, 2, '0') from generate_series(1, 12) i;
  select array_agg('TST-' || lpad(i::text, 2, '0')) into nos from generate_series(1, 10) i;

  -- act as the OPERATOR
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', op_id, 'role', 'authenticated')::text, true);

  -- 1. bulk handover of 10 devices to one staff member (Day shift)
  perform public.issue_devices(nos, s1, '', 'B-TEST', 'Day');
  select count(*) into n from public.transactions where staff_id = s1 and returned_at is null;
  if n <> 10 then raise exception 'FAIL 1: expected 10 active, got %', n; end if;

  -- 2. transfer 3 selected devices to another staff member (Night shift)
  perform public.transfer_devices(array['TST-01','TST-02','TST-03'], s2, 'Night', 'shift change', 'T-ONE');

  -- 3. original staff member now has exactly 7
  select count(*) into n from public.transactions where staff_id = s1 and returned_at is null;
  select count(*) into n2 from public.transactions where staff_id = s2 and returned_at is null;
  if n <> 7 or n2 <> 3 then raise exception 'FAIL 3: s1 has %, s2 has % (expected 7 / 3)', n, n2; end if;

  -- 4. transfer the remaining 7 to a third staff member (Day shift)
  perform public.transfer_devices(array['TST-04','TST-05','TST-06','TST-07','TST-08','TST-09','TST-10'], s3, 'Day', '', 'T-TWO');

  -- 5. original staff member has no active devices
  select count(*) into n from public.transactions where staff_id = s1 and returned_at is null;
  if n <> 0 then raise exception 'FAIL 5: s1 still holds %', n; end if;
  select count(*) into n from public.transactions where staff_id = s3 and returned_at is null;
  if n <> 7 then raise exception 'FAIL 5: s3 should hold 7, holds %', n; end if;

  -- 6. history: 10 transfer rows; originals closed as 'transfer' (not 'return'); chain points back to Test Original
  select count(*) into n from public.transfers where origin_staff_name = 'Test Original';
  if n <> 10 then raise exception 'FAIL 6: expected 10 transfer rows, got %', n; end if;
  select count(*) into n from public.transactions where staff_id = s1 and end_type = 'transfer' and returned_at is not null;
  if n <> 10 then raise exception 'FAIL 6: expected 10 closed-as-transfer rows for s1, got %', n; end if;
  select count(*) into n from public.transactions t
    join public.transactions o on o.id = t.origin_tx
   where t.transferred_from is not null and o.staff_name = 'Test Original';
  if n <> 10 then raise exception 'FAIL 6: origin chain broken (% of 10)', n; end if;
  select count(*) into n from public.audit_log where action = 'TRANSFER' and user_name = 'Test Operator';
  if n <> 10 then raise exception 'FAIL 6: expected 10 TRANSFER audit rows, got %', n; end if;
  -- a transfer must not count as a return
  select count(*) into n from public.transactions where end_type = 'return';
  if n <> 0 then raise exception 'FAIL 6: transfers leaked into returns (%)', n; end if;

  -- 7. shifts recorded on every transaction
  select count(*) into n from public.transactions where batch_ref = 'B-TEST' and shift = 'Day' and return_shift in ('Night','Day');
  if n <> 10 then raise exception 'FAIL 7: issue/transfer-out shifts wrong (%)', n; end if;
  select count(*) into n from public.transactions where transferred_from is not null and shift = 'Night' and device_no in ('TST-01','TST-02','TST-03');
  if n <> 3 then raise exception 'FAIL 7: Night transfers wrong (%)', n; end if;
  perform public.return_devices('[{"no":"TST-04","cond":"Good"}]'::jsonb, '', null, 'Night');
  select count(*) into n from public.transactions where device_no = 'TST-04' and end_type = 'return' and return_shift = 'Night';
  if n <> 1 then raise exception 'FAIL 7: return shift not recorded'; end if;
  failed := false;
  begin perform public.issue_devices(array['TST-11'], s1, '', null, null); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL 7: issue without a shift should be refused'; end if;

  -- a transfer onto the current holder, or of an unissued device, is refused
  failed := false;
  begin perform public.transfer_devices(array['TST-05'], s3, 'Day', '', null); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL: transfer to same holder should be refused'; end if;
  failed := false;
  begin perform public.transfer_devices(array['TST-11'], s2, 'Day', '', null); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL: transfer of unissued device should be refused'; end if;

  -- 9. operator cannot delete / archive / deactivate (function level AND direct table level)
  failed := false;
  begin perform public.delete_device((select id from public.devices where device_no = 'TST-11'), 'x'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL 9: operator could delete a device'; end if;
  failed := false;
  begin perform public.delete_staff(s4, 'x'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL 9: operator could delete staff'; end if;
  failed := false;
  begin perform public.archive_device((select id from public.devices where device_no = 'TST-11'), 'x'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL 9: operator could archive a device'; end if;
  failed := false;
  begin delete from public.devices where device_no = 'TST-11'; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL 9: operator could DELETE directly on the table'; end if;

  -- 10. administrator
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform public.delete_device((select id from public.devices where device_no = 'TST-11'), 'test: unused device');
  if exists (select 1 from public.devices where device_no = 'TST-11') then raise exception 'FAIL 10: eligible device not deleted'; end if;

  failed := false;  -- history -> delete refused
  begin perform public.delete_device((select id from public.devices where device_no = 'TST-04'), 'x'); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL 10: device with history was deleted'; end if;
  failed := false;  -- active assignment -> delete / archive refused
  begin perform public.archive_device((select id from public.devices where device_no = 'TST-05'), 'x'); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL 10: archived a device that is still issued'; end if;
  failed := false;  -- reason required
  begin perform public.archive_device((select id from public.devices where device_no = 'TST-04'), ''); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL 10: archive without a reason accepted'; end if;

  perform public.archive_device((select id from public.devices where device_no = 'TST-04'), 'test: retired from fleet');
  if not exists (select 1 from public.devices where device_no = 'TST-04' and archived_at is not null and status = 'Retired') then
    raise exception 'FAIL 10: archive did not apply';
  end if;
  if not exists (select 1 from public.transactions where device_no = 'TST-04') then raise exception 'FAIL 10: history lost on archive'; end if;

  failed := false;  -- staff with an active device or history can't be deleted
  begin perform public.delete_staff(s3, 'x'); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL 10: staff holding devices was deleted'; end if;
  failed := false;
  begin perform public.delete_staff(s1, 'x'); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL 10: staff with history was deleted'; end if;
  perform public.set_staff_active(s1, false, 'test: left the company');
  if exists (select 1 from public.staff where id = s1 and active) then raise exception 'FAIL 10: deactivate did not apply'; end if;
  perform public.delete_staff(s4, 'test: duplicate entry');
  if exists (select 1 from public.staff where id = s4) then raise exception 'FAIL 10: eligible staff not deleted'; end if;

  -- every destructive admin action is audited with admin + reason
  select count(*) into n from public.audit_log
   where user_name = 'Test Admin' and reason <> '' and action in ('DEVICE DELETE','DEVICE ARCHIVE','STAFF DELETE','STAFF DEACTIVATE');
  if n <> 4 then raise exception 'FAIL 10: expected 4 audited admin actions with reasons, got %', n; end if;

  reset role;
  raise exception 'ALL 10 SCENARIOS PASSED (all test data rolled back)';
end
$test$;
