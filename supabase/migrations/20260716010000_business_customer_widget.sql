-- Business Customer Widget backend model. Every record is scoped to the selected
-- Field Office client workspace through group_id and protected by group RLS.

create table if not exists public.business_customer_types (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  hidden boolean not null default false,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);

create table if not exists public.business_customer_statuses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);

create table if not exists public.business_customers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_number text not null,
  customer_type text not null,
  status text not null default 'Lead',
  customer_name text not null,
  business_name text,
  first_name text,
  last_name text,
  primary_phone text,
  secondary_phone text,
  email text,
  preferred_contact_method text,
  billing_address text,
  service_address text,
  mailing_address text,
  lead_source text,
  assigned_staff_id uuid,
  tags text[] not null default '{}',
  internal_notes text,
  customer_notes text,
  tax_exempt boolean not null default false,
  payment_terms text,
  communication_permissions jsonb not null default '{}',
  custom_fields jsonb not null default '{}',
  do_not_contact boolean not null default false,
  do_not_service boolean not null default false,
  favorite boolean not null default false,
  outstanding_balance numeric(12,2) not null default 0,
  last_contact_date date,
  next_appointment_date date,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (group_id, customer_number)
);

create table if not exists public.business_customer_contacts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_id uuid not null references public.business_customers(id) on delete cascade,
  first_name text,
  last_name text,
  role text,
  department text,
  phone text,
  alternate_phone text,
  email text,
  preferred_contact_method text,
  is_primary boolean not null default false,
  is_billing boolean not null default false,
  is_scheduling boolean not null default false,
  is_emergency boolean not null default false,
  notes text,
  communication_permissions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_customer_locations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_id uuid not null references public.business_customers(id) on delete cascade,
  location_name text,
  address text,
  suite text,
  city text,
  state text,
  zip text,
  county text,
  service_area text,
  property_type text,
  gate_code text,
  access_instructions text,
  parking_instructions text,
  site_contact_id uuid,
  is_billing boolean not null default false,
  is_primary_service boolean not null default false,
  notes text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_customer_notes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_id uuid not null references public.business_customers(id) on delete cascade,
  note_type text not null default 'General',
  content text not null,
  privacy_level text not null default 'internal',
  pinned boolean not null default false,
  related_job_id uuid,
  related_invoice_id uuid,
  related_appointment_id uuid,
  related_communication_id uuid,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_customer_alerts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_id uuid not null references public.business_customers(id) on delete cascade,
  alert_type text not null,
  message text not null,
  severity text not null default 'warning',
  expires_at timestamptz,
  dismissed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.business_customer_tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_id uuid not null references public.business_customers(id) on delete cascade,
  task_id uuid,
  title text not null,
  assigned_staff_id uuid,
  due_date date,
  priority text not null default 'Normal',
  status text not null default 'Open',
  related_job_id uuid,
  related_invoice_id uuid,
  related_estimate_id uuid,
  related_appointment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_customer_documents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_id uuid not null references public.business_customers(id) on delete cascade,
  location_id uuid references public.business_customer_locations(id) on delete set null,
  related_job_id uuid,
  file_name text not null,
  file_type text,
  category text,
  storage_path text not null,
  expiration_date date,
  notes text,
  privacy_level text not null default 'internal',
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.business_customer_communications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_id uuid not null references public.business_customers(id) on delete cascade,
  communication_type text not null,
  direction text,
  occurred_at timestamptz not null default now(),
  staff_id uuid,
  contact_id uuid references public.business_customer_contacts(id) on delete set null,
  subject text,
  summary text,
  full_message text,
  related_job_id uuid,
  related_appointment_id uuid,
  related_estimate_id uuid,
  related_invoice_id uuid,
  follow_up_required boolean not null default false,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.business_customer_activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_id uuid not null references public.business_customers(id) on delete cascade,
  action text not null,
  changed_by uuid references auth.users(id),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.business_customer_saved_views (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}',
  visible_columns jsonb not null default '[]',
  view_type text not null default 'table',
  sort_by text,
  page_size integer not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_customer_imports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid references auth.users(id),
  file_name text,
  column_mapping jsonb not null default '{}',
  preview_rows jsonb not null default '[]',
  errors jsonb not null default '[]',
  status text not null default 'preview',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists business_customers_group_name_idx on public.business_customers (group_id, customer_name);
create index if not exists business_customers_group_status_idx on public.business_customers (group_id, status);
create index if not exists business_customers_group_type_idx on public.business_customers (group_id, customer_type);
create index if not exists business_customers_tags_idx on public.business_customers using gin (tags);
create index if not exists business_customer_contacts_group_customer_idx on public.business_customer_contacts (group_id, customer_id);
create index if not exists business_customer_locations_group_customer_idx on public.business_customer_locations (group_id, customer_id);
create index if not exists business_customer_activity_group_customer_idx on public.business_customer_activity (group_id, customer_id, created_at desc);

alter table public.business_customer_types enable row level security;
alter table public.business_customer_statuses enable row level security;
alter table public.business_customers enable row level security;
alter table public.business_customer_contacts enable row level security;
alter table public.business_customer_locations enable row level security;
alter table public.business_customer_notes enable row level security;
alter table public.business_customer_alerts enable row level security;
alter table public.business_customer_tasks enable row level security;
alter table public.business_customer_documents enable row level security;
alter table public.business_customer_communications enable row level security;
alter table public.business_customer_activity enable row level security;
alter table public.business_customer_saved_views enable row level security;
alter table public.business_customer_imports enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['business_customer_types','business_customer_statuses','business_customers','business_customer_contacts','business_customer_locations','business_customer_notes','business_customer_alerts','business_customer_tasks','business_customer_documents','business_customer_communications','business_customer_activity','business_customer_saved_views','business_customer_imports'] loop
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
