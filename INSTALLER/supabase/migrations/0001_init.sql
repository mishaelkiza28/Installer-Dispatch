-- =====================================================================
-- Installer Dispatch — email-only work order receiving & dispatch
-- Run once against a fresh Supabase project (SQL editor or `supabase db push`).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------
create table app_settings (
  id            boolean primary key default true check (id),
  company_name  text not null default 'TSG Solar',
  office_phone  text,
  office_emails text[] not null default '{}',   -- who gets "accepted / declined / done" emails
  app_url       text,                           -- console URL, captured automatically on dispatch
  updated_at    timestamptz not null default now()
);
insert into app_settings (id, office_emails) values (true, array['mishaelkiza28@gmail.com']);

-- ---------------------------------------------------------------------
-- Dispatchers: only confirmed logins whose email is on this list can
-- see or change anything. A stranger who signs up gets nothing.
-- ---------------------------------------------------------------------
create table dispatchers (
  email    text primary key check (email = lower(email) and position('@' in email) > 1),
  added_at timestamptz not null default now()
);
insert into dispatchers (email) values ('mishaelkiza28@gmail.com');

create or replace function is_dispatcher() returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.dispatchers d on d.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

-- ---------------------------------------------------------------------
-- Installers (receive jobs by email only — no app, no login)
-- ---------------------------------------------------------------------
create table installers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  email      text not null check (position('@' in email) > 1),
  phone      text,
  area       text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index installers_email_key on installers (lower(email));

-- ---------------------------------------------------------------------
-- Work orders
-- ---------------------------------------------------------------------
create type wo_status as enum (
  'unassigned', 'dispatched', 'accepted', 'on_site', 'completed', 'verified', 'cancelled'
);
create type wo_priority as enum ('low', 'normal', 'urgent');

create table work_orders (
  id                  uuid primary key default gen_random_uuid(),
  ref_no              bigint generated always as identity unique,   -- shown as WO-0001
  title               text not null check (length(trim(title)) > 0),
  job_type            text,
  client_name         text,
  client_phone        text,
  site_address        text,
  district            text,
  scheduled_for       date,
  priority            wo_priority not null default 'normal',
  description         text,
  status              wo_status not null default 'unassigned',
  assigned_to         uuid references installers(id) on delete set null,
  installer_token     text unique,          -- secret in the installer's email links
  completion_note     text,
  last_declined_by    uuid references installers(id) on delete set null,
  last_decline_reason text,
  source              text not null default 'console' check (source in ('console', 'import')),
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  dispatched_at       timestamptz,
  accepted_at         timestamptz,
  on_site_at          timestamptz,
  completed_at        timestamptz,
  verified_at         timestamptz,
  cancelled_at        timestamptz
);
create index work_orders_status_idx on work_orders (status);
create index work_orders_assigned_idx on work_orders (assigned_to);
create index work_orders_declined_idx on work_orders (last_declined_by);
create index work_orders_created_by_idx on work_orders (created_by);

-- ---------------------------------------------------------------------
-- Timeline: every status change, email sent/failed, edit and note
-- ---------------------------------------------------------------------
create table work_order_events (
  id            bigint generated always as identity primary key,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  kind          text not null,
  actor         text not null default 'office' check (actor in ('office', 'installer', 'system')),
  actor_name    text,
  message       text,
  created_at    timestamptz not null default now()
);
create index work_order_events_wo_idx on work_order_events (work_order_id, created_at);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function wo_before_update() returns trigger
language plpgsql set search_path = public
as $$
begin
  -- Reassigning is only allowed while the job is unassigned (recall it first).
  -- Status-changing updates come from wo_transition(), which handles this itself.
  if new.assigned_to is distinct from old.assigned_to
     and new.status = old.status
     and old.status <> 'unassigned' then
    raise exception 'Recall the job before assigning it to someone else';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger wo_before_update before update on work_orders
  for each row execute function wo_before_update();

create or replace function wo_after_write() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor text := coalesce(auth.jwt() ->> 'email', 'system');
  v_name  text;
begin
  if tg_op = 'INSERT' then
    insert into work_order_events (work_order_id, kind, actor, actor_name, message)
    values (new.id, case when new.source = 'import' then 'imported' else 'created' end,
            'office', v_actor, null);
    if new.assigned_to is not null then
      select name into v_name from installers where id = new.assigned_to;
      insert into work_order_events (work_order_id, kind, actor, actor_name, message)
      values (new.id, 'assigned', 'office', v_actor, 'Assigned to ' || v_name);
    end if;
    return new;
  end if;

  -- UPDATE, only for changes made outside a status transition
  if new.status = old.status then
    if new.assigned_to is distinct from old.assigned_to then
      if new.assigned_to is null then
        insert into work_order_events (work_order_id, kind, actor, actor_name, message)
        values (new.id, 'unassigned', 'office', v_actor, 'Assignment cleared');
      else
        select name into v_name from installers where id = new.assigned_to;
        insert into work_order_events (work_order_id, kind, actor, actor_name, message)
        values (new.id, 'assigned', 'office', v_actor, 'Assigned to ' || v_name);
      end if;
    end if;
    if (new.title, new.job_type, new.client_name, new.client_phone, new.site_address,
        new.district, new.scheduled_for, new.priority, new.description)
       is distinct from
       (old.title, old.job_type, old.client_name, old.client_phone, old.site_address,
        old.district, old.scheduled_for, old.priority, old.description) then
      insert into work_order_events (work_order_id, kind, actor, actor_name, message)
      values (new.id, 'edited', 'office', v_actor, 'Job details edited');
    end if;
  end if;
  return new;
end;
$$;
create trigger wo_after_write after insert or update on work_orders
  for each row execute function wo_after_write();

-- ---------------------------------------------------------------------
-- Guarded status transitions. The only way status moves.
-- ---------------------------------------------------------------------
create or replace function wo_transition(
  p_id         uuid,
  p_to         wo_status,
  p_actor      text,
  p_actor_name text,
  p_kind       text default null,
  p_message    text default null
) returns work_orders
language plpgsql security definer set search_path = public
as $$
declare
  v  work_orders;
  ok boolean;
begin
  select * into v from work_orders where id = p_id for update;
  if not found then
    raise exception 'Work order not found';
  end if;

  ok := case v.status
    when 'unassigned' then p_to in ('dispatched', 'cancelled')
    when 'dispatched' then p_to in ('accepted', 'on_site', 'completed', 'unassigned', 'cancelled')
    when 'accepted'   then p_to in ('on_site', 'completed', 'unassigned', 'cancelled')
    when 'on_site'    then p_to in ('completed', 'unassigned', 'cancelled')
    when 'completed'  then p_to in ('verified')
    when 'cancelled'  then p_to in ('unassigned')
    else false
  end;
  if not ok then
    raise exception 'WO-% is % — it can''t move to %',
      lpad(v.ref_no::text, 4, '0'), replace(v.status::text, '_', ' '), replace(p_to::text, '_', ' ');
  end if;

  update work_orders set
    status          = p_to,
    -- back to the queue: drop the installer and invalidate their email links
    assigned_to     = case when p_to = 'unassigned' then null else assigned_to end,
    installer_token = case when p_to in ('unassigned', 'cancelled') then null else installer_token end,
    dispatched_at   = case when p_to = 'dispatched' then now() when p_to = 'unassigned' then null else dispatched_at end,
    accepted_at     = case when p_to = 'accepted'  then now() when p_to = 'unassigned' then null else accepted_at end,
    on_site_at      = case when p_to = 'on_site'   then now() when p_to = 'unassigned' then null else on_site_at end,
    completed_at    = case when p_to = 'completed' then now() else completed_at end,
    verified_at     = case when p_to = 'verified'  then now() else verified_at end,
    cancelled_at    = case when p_to = 'cancelled' then now() when p_to = 'unassigned' then null else cancelled_at end
  where id = p_id
  returning * into v;

  insert into work_order_events (work_order_id, kind, actor, actor_name, message)
  values (p_id, coalesce(p_kind, p_to::text), p_actor, p_actor_name, p_message);

  return v;
end;
$$;

-- Called by the work-order-action function after the job email went out.
create or replace function wo_mark_dispatched(p_id uuid, p_token text, p_actor_name text, p_message text)
returns work_orders
language plpgsql security definer set search_path = public
as $$
declare v work_orders;
begin
  select * into v from work_orders where id = p_id for update;
  if v.status <> 'unassigned' or v.assigned_to is null then
    raise exception 'Job is no longer ready to dispatch';
  end if;
  v := wo_transition(p_id, 'dispatched', 'office', p_actor_name, 'dispatched', p_message);
  update work_orders set
    installer_token = p_token,
    last_declined_by = null,
    last_decline_reason = null,
    completion_note = null,
    completed_at = null
  where id = p_id
  returning * into v;
  return v;
end;
$$;

-- Called by the installer-action function (installer clicked a button in their email).
create or replace function wo_installer_action(p_token text, p_action text, p_note text default null)
returns work_orders
language plpgsql security definer set search_path = public
as $$
declare
  v       work_orders;
  v_name  text;
  v_to    wo_status;
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
  v_inst  uuid;
begin
  select * into v from work_orders where installer_token = p_token for update;
  if not found then
    raise exception 'This job link is no longer active';
  end if;
  select name into v_name from installers where id = v.assigned_to;
  v_inst := v.assigned_to;

  v_to := case p_action
    when 'accept'  then 'accepted'
    when 'on_site' then 'on_site'
    when 'done'    then 'completed'
    when 'decline' then 'unassigned'
    else null
  end::wo_status;
  if v_to is null then
    raise exception 'Unknown action';
  end if;

  -- Double-clicks and re-opened emails are harmless
  if v.status = v_to then
    return v;
  end if;

  v := wo_transition(
    v.id, v_to, 'installer', v_name,
    case p_action when 'decline' then 'declined' when 'done' then 'completed' else v_to::text end,
    v_note
  );

  if p_action = 'decline' then
    update work_orders set last_declined_by = v_inst, last_decline_reason = v_note
    where id = v.id returning * into v;
  elsif p_action = 'done' then
    update work_orders set completion_note = v_note where id = v.id returning * into v;
  end if;
  return v;
end;
$$;

-- Browser-callable, for the two moves that never email anyone.
create or replace function office_set_status(p_id uuid, p_to wo_status)
returns work_orders
language plpgsql security definer set search_path = public
as $$
declare v_kind text;
begin
  if not is_dispatcher() then
    raise exception 'Not allowed';
  end if;
  if p_to = 'verified' then
    v_kind := 'verified';
  elsif p_to = 'unassigned' then
    v_kind := 'reopened';
  else
    raise exception 'Use the dispatch actions for this change';
  end if;
  return wo_transition(p_id, p_to, 'office', auth.jwt() ->> 'email', v_kind, null);
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke all on table app_settings, dispatchers, installers, work_orders, work_order_events
  from anon, authenticated;

grant select on app_settings, dispatchers, installers, work_orders, work_order_events to authenticated;
grant update (company_name, office_phone, office_emails) on app_settings to authenticated;
grant insert, delete on dispatchers to authenticated;
grant insert, update, delete on installers to authenticated;
grant insert (title, job_type, client_name, client_phone, site_address, district, scheduled_for,
              priority, description, assigned_to, source)
  on work_orders to authenticated;
grant update (title, job_type, client_name, client_phone, site_address, district, scheduled_for,
              priority, description, assigned_to)
  on work_orders to authenticated;
grant delete on work_orders to authenticated;

revoke execute on function is_dispatcher() from public, anon;
grant  execute on function is_dispatcher() to authenticated;
revoke execute on function office_set_status(uuid, wo_status) from public, anon;
grant  execute on function office_set_status(uuid, wo_status) to authenticated;
revoke execute on function wo_transition(uuid, wo_status, text, text, text, text) from public, anon, authenticated;
revoke execute on function wo_mark_dispatched(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function wo_installer_action(text, text, text) from public, anon, authenticated;
revoke execute on function wo_before_update() from public, anon, authenticated;
revoke execute on function wo_after_write() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Row level security — everything gated on is_dispatcher()
-- ---------------------------------------------------------------------
alter table app_settings      enable row level security;
alter table dispatchers       enable row level security;
alter table installers        enable row level security;
alter table work_orders       enable row level security;
alter table work_order_events enable row level security;

create policy "dispatchers read settings"   on app_settings for select to authenticated using ((select is_dispatcher()));
create policy "dispatchers update settings" on app_settings for update to authenticated
  using ((select is_dispatcher())) with check ((select is_dispatcher()));

create policy "dispatchers read dispatchers" on dispatchers for select to authenticated using ((select is_dispatcher()));
create policy "dispatchers add dispatchers"  on dispatchers for insert to authenticated with check ((select is_dispatcher()));
create policy "dispatchers remove others"    on dispatchers for delete to authenticated
  using ((select is_dispatcher()) and email <> lower((select auth.jwt()) ->> 'email'));

create policy "dispatchers manage installers" on installers for all to authenticated
  using ((select is_dispatcher())) with check ((select is_dispatcher()));

create policy "dispatchers read work orders"   on work_orders for select to authenticated using ((select is_dispatcher()));
create policy "dispatchers create work orders" on work_orders for insert to authenticated
  with check ((select is_dispatcher()) and status = 'unassigned');
create policy "dispatchers edit work orders"   on work_orders for update to authenticated
  using ((select is_dispatcher())) with check ((select is_dispatcher()));
create policy "dispatchers delete open or cancelled" on work_orders for delete to authenticated
  using ((select is_dispatcher()) and status in ('unassigned', 'cancelled'));

create policy "dispatchers read events" on work_order_events for select to authenticated using ((select is_dispatcher()));

-- ---------------------------------------------------------------------
-- Live board updates
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table work_orders, work_order_events;
