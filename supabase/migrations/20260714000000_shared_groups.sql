-- Shared workspace/group support for the CRM app.
-- This migration matches the Supabase queries in src/main.js.

create extension if not exists pgcrypto;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9]{6,}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.pipelines
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

alter table public.pipeline_steps
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

alter table public.pipeline_items
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

create index if not exists groups_code_idx on public.groups (code);
create index if not exists group_members_user_id_idx on public.group_members (user_id);
create index if not exists pipelines_group_id_idx on public.pipelines (group_id);
create index if not exists pipeline_steps_group_id_idx on public.pipeline_steps (group_id);
create index if not exists pipeline_items_group_id_idx on public.pipeline_items (group_id);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_steps enable row level security;
alter table public.pipeline_items enable row level security;

-- Groups: members can read their groups, and authenticated users can look up
-- groups by code so src/main.js can join via .from('groups').select(...).eq('code', code).
drop policy if exists "Members can read their groups" on public.groups;
create policy "Members can read their groups"
  on public.groups
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.group_members gm
      where gm.group_id = groups.id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can find groups by code" on public.groups;
create policy "Authenticated users can find groups by code"
  on public.groups
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create groups" on public.groups;
create policy "Authenticated users can create groups"
  on public.groups
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Memberships: users can see and create their own membership rows. This lets
-- createGroup() add the creator and joinGroup() upsert the joining user.
drop policy if exists "Users can read their memberships" on public.group_members;
create policy "Users can read their memberships"
  on public.group_members
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can join groups as themselves" on public.group_members;
create policy "Users can join groups as themselves"
  on public.group_members
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their memberships" on public.group_members;
create policy "Users can update their memberships"
  on public.group_members
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- CRM data: only members of a group can read/write rows for that group.
drop policy if exists "Group members can read pipelines" on public.pipelines;
create policy "Group members can read pipelines"
  on public.pipelines
  for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipelines.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can create pipelines" on public.pipelines;
create policy "Group members can create pipelines"
  on public.pipelines
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = pipelines.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can update pipelines" on public.pipelines;
create policy "Group members can update pipelines"
  on public.pipelines
  for update
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipelines.group_id
        and gm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipelines.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can delete pipelines" on public.pipelines;
create policy "Group members can delete pipelines"
  on public.pipelines
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipelines.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can read pipeline steps" on public.pipeline_steps;
create policy "Group members can read pipeline steps"
  on public.pipeline_steps
  for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipeline_steps.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can create pipeline steps" on public.pipeline_steps;
create policy "Group members can create pipeline steps"
  on public.pipeline_steps
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = pipeline_steps.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can update pipeline steps" on public.pipeline_steps;
create policy "Group members can update pipeline steps"
  on public.pipeline_steps
  for update
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipeline_steps.group_id
        and gm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipeline_steps.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can delete pipeline steps" on public.pipeline_steps;
create policy "Group members can delete pipeline steps"
  on public.pipeline_steps
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipeline_steps.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can read pipeline items" on public.pipeline_items;
create policy "Group members can read pipeline items"
  on public.pipeline_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipeline_items.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can create pipeline items" on public.pipeline_items;
create policy "Group members can create pipeline items"
  on public.pipeline_items
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = pipeline_items.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can update pipeline items" on public.pipeline_items;
create policy "Group members can update pipeline items"
  on public.pipeline_items
  for update
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipeline_items.group_id
        and gm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipeline_items.group_id
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "Group members can delete pipeline items" on public.pipeline_items;
create policy "Group members can delete pipeline items"
  on public.pipeline_items
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = pipeline_items.group_id
        and gm.user_id = auth.uid()
    )
  );
