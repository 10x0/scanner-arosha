-- Performance: indexes for history lookups, delete-eligibility checks and status counts.
create index if not exists tx_device_idx          on public.transactions (device_id);
create index if not exists tx_staff_all_idx       on public.transactions (staff_id);
create index if not exists transfers_from_idx     on public.transfers (from_staff_id);
create index if not exists transfers_to_idx       on public.transfers (to_staff_id);
create index if not exists devices_status_idx     on public.devices (status);
create index if not exists devices_active_no_idx  on public.devices (device_no) where archived_at is null;
analyze public.transactions;
analyze public.devices;
