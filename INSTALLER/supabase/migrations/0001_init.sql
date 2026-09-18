-- Work Order Dispatch Platform — initial schema
-- Run this against a fresh Supabase project (SQL editor, or `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Technicians
-- ---------------------------------------------------------------------
create table technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone_e164 text not null unique,        -- e.g. +2567xxxxxxxx — used for SMS + WhatsApp
  whatsapp_opt_in boolean not null default true,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Work orders
-- ---------------------------------------------------------------------
create type work_order_status as enum (
  'unassigned',
  'dispatched',
  'acknowledged',
  'in_progress',
  'completed',
  'verified',
  'cancelled'
);

create type work_order_priority as enum ('low', 'normal', 'urgent');

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  site_address text,
  priority work_order_priority not null default 'normal',
  status work_order_status not null default 'unassigned',
  assigned_to uuid references technicians(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  acknowledged_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz
);

-- ---------------------------------------------------------------------
-- Notification log — the audit trail for every outbound send and every
-- inbound reply, across all three channels.
-- ---------------------------------------------------------------------
create type notification_channel as enum ('sms', 'whatsapp', 'email');
create type notification_direction as enum ('outbound', 'inbound');
create type notification_status as enum ('queued', 'sent', 'delivered', 'failed', 'received');

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references work_orders(id) on delete cascade,
  technician_id uuid references technicians(id),
  channel notification_channel not null,
  direction notification_direction not null,
  body text not null,
  provider_message_id text,
  status notification_status not null default 'queued',
  created_at timestamptz not null default now()
);

create index on notification_log (work_order_id, created_at);

-- ---------------------------------------------------------------------
-- Guarded status transitions — mirrors the pattern already proven in
-- Solar Garage: status only moves through this function, so no
-- transition skips its timestamp or gets set to something invalid.
-- ---------------------------------------------------------------------
create or replace function advance_work_order(
  p_work_order_id uuid,
  p_new_status work_order_status
) returns work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row work_orders;
  v_allowed boolean;
begin
  select * into v_row from work_orders where id = p_work_order_id for update;
  if not found then
    raise exception 'work order % not found', p_work_order_id;
  end if;

  v_allowed := case v_row.status
    when 'unassigned'   then p_new_status in ('dispatched', 'cancelled')
    when 'dispatched'   then p_new_status in ('acknowledged', 'in_progress', 'cancelled')
    when 'acknowledged' then p_new_status in ('in_progress', 'cancelled')
    when 'in_progress'  then p_new_status in ('completed', 'cancelled')
    when 'completed'    then p_new_status in ('verified')
    else false
  end;

  if not v_allowed then
    raise exception 'cannot move work order from % to %', v_row.status, p_new_status;
  end if;

  update work_orders set
    status          = p_new_status,
    dispatched_at   = case when p_new_status = 'dispatched'   then now() else dispatched_at end,
    acknowledged_at = case when p_new_status = 'acknowledged' then now() else acknowledged_at end,
    started_at      = case when p_new_status = 'in_progress'  then now() else started_at end,
    completed_at    = case when p_new_status = 'completed'    then now() else completed_at end,
    verified_at     = case when p_new_status = 'verified'     then now() else verified_at end
  where id = p_work_order_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function advance_work_order from public;
grant execute on function advance_work_order to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;

-- status only moves via advance_work_order(); direct UPDATE is blocked
-- even for the dispatcher UI, so history and SLA timestamps can't skip.
revoke update (status) on work_orders from authenticated;

alter table technicians enable row level security;
alter table work_orders enable row level security;
alter table notification_log enable row level security;

-- Single-role MVP: any authenticated dispatcher can manage everything.
-- Tighten this later if you add more than one role (e.g. read-only office staff).
create policy "dispatchers manage technicians" on technicians
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "dispatchers manage work orders" on work_orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "dispatchers read notification log" on notification_log
  for select using (auth.role() = 'authenticated');

-- notification_log rows are written by the edge functions using the
-- service_role key, which bypasses RLS — dispatchers only ever read it.
