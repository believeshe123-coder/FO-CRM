-- Calendar widget backend model. Every row is scoped by group_id/business_id
-- and protected by the same group_members RLS boundary as the dashboard.

create table if not exists public.calendar_types (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  color text,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);

create table if not exists public.calendar_statuses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  event_type text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  time_zone text not null default 'UTC',
  status text not null default 'Scheduled',
  priority text not null default 'Normal',
  category text,
  color text,
  tags text[] not null default '{}',
  internal_notes text,
  customer_notes text,
  customer_id uuid,
  contact_id uuid,
  job_id uuid,
  estimate_id uuid,
  invoice_id uuid,
  service_address text,
  location_instructions text,
  recurrence_rule jsonb,
  recurrence_series_id uuid,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at >= start_at)
);

create table if not exists public.calendar_event_attendees (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  contact_id uuid,
  name text,
  email text,
  phone text,
  response_status text default 'Pending',
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_event_assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  employee_id uuid,
  crew_id uuid,
  supervisor_id uuid,
  department text,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_event_resources (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  resource_id uuid,
  resource_type text not null,
  resource_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_event_reminders (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  method text not null check (method in ('in_app','email','sms_placeholder')),
  remind_at timestamptz,
  offset_minutes integer,
  integration_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_event_attachments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_event_exceptions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  occurrence_date date not null,
  action text not null check (action in ('skip','override','delete_future')),
  override_data jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_event_activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  action text not null,
  changed_by uuid references auth.users(id),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_saved_views (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}',
  view text not null default 'month',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_widget_preferences (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  widget_id text not null,
  view text not null default 'month',
  filters jsonb not null default '{}',
  position jsonb not null default '{}',
  size jsonb not null default '{}',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id, widget_id)
);

create index if not exists calendar_events_group_start_idx on public.calendar_events (group_id, start_at, end_at);
create index if not exists calendar_events_group_status_idx on public.calendar_events (group_id, status);
create index if not exists calendar_events_group_type_idx on public.calendar_events (group_id, event_type);
create index if not exists calendar_events_tags_idx on public.calendar_events using gin (tags);
create index if not exists calendar_assignments_group_event_idx on public.calendar_event_assignments (group_id, event_id);
create index if not exists calendar_resources_group_event_idx on public.calendar_event_resources (group_id, event_id);
create index if not exists calendar_reminders_group_event_idx on public.calendar_event_reminders (group_id, event_id);

alter table public.calendar_types enable row level security;
alter table public.calendar_statuses enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_event_attendees enable row level security;
alter table public.calendar_event_assignments enable row level security;
alter table public.calendar_event_resources enable row level security;
alter table public.calendar_event_reminders enable row level security;
alter table public.calendar_event_attachments enable row level security;
alter table public.calendar_event_exceptions enable row level security;
alter table public.calendar_event_activity enable row level security;
alter table public.calendar_saved_views enable row level security;
alter table public.calendar_widget_preferences enable row level security;

create or replace function public.is_group_member(target_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members gm where gm.group_id = target_group_id and gm.user_id = auth.uid());
$$;

-- Apply uniform group isolation policies to all calendar tables.
do $$
declare table_name text;
begin
  foreach table_name in array array['calendar_types','calendar_statuses','calendar_events','calendar_event_attendees','calendar_event_assignments','calendar_event_resources','calendar_event_reminders','calendar_event_attachments','calendar_event_exceptions','calendar_event_activity','calendar_saved_views','calendar_widget_preferences'] loop
    execute format('drop policy if exists "Group members can read %I" on public.%I', table_name, table_name);
    execute format('create policy "Group members can read %I" on public.%I for select to authenticated using (public.is_group_member(group_id))', table_name, table_name);
    execute format('drop policy if exists "Group members can create %I" on public.%I', table_name, table_name);
    execute format('create policy "Group members can create %I" on public.%I for insert to authenticated with check (public.is_group_member(group_id))', table_name, table_name);
    execute format('drop policy if exists "Group members can update %I" on public.%I', table_name, table_name);
    execute format('create policy "Group members can update %I" on public.%I for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id))', table_name, table_name);
    execute format('drop policy if exists "Group members can delete %I" on public.%I', table_name, table_name);
    execute format('create policy "Group members can delete %I" on public.%I for delete to authenticated using (public.is_group_member(group_id))', table_name, table_name);
  end loop;
end $$;
