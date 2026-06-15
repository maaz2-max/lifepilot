create table if not exists public.notification_items (
  id uuid primary key default gen_random_uuid(),
  user_key text not null default 'default',
  local_id text not null,
  type text not null,
  title text not null,
  body text default '',
  due_at timestamptz not null,
  repeat text default 'No repeat',
  status text default 'active',
  priority text default 'Medium',
  timezone text default 'Asia/Kolkata',
  source_updated_at timestamptz default now(),
  enabled boolean default true,
  last_sent_key text,
  last_sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_key, local_id, type)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.notification_items(id) on delete cascade,
  user_key text not null default 'default',
  scheduled_for timestamptz,
  sent_at timestamptz,
  channel text default 'telegram',
  status text default 'sent',
  error text,
  created_at timestamptz default now()
);

create table if not exists public.telegram_settings (
  user_key text primary key default 'default',
  chat_id text,
  enabled boolean default false,
  categories jsonb default '{}'::jsonb,
  quiet_hours jsonb default '{}'::jsonb,
  timezone text default 'Asia/Kolkata',
  last_sync_at timestamptz,
  updated_at timestamptz default now()
);

-- Shared Cloud Project Mode Tables
create table if not exists public.cloud_projects (
  id text primary key,
  name text not null,
  type text not null,
  budget numeric not null default 0,
  start_date text not null,
  end_date text not null,
  status text not null default 'Active',
  pin text not null default '2002',
  owner_name text not null default 'Owner',
  sharing_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cloud_participants (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.cloud_projects(id) on delete cascade,
  name text not null,
  role text not null default 'participant',
  created_at timestamptz not null default now()
);

create table if not exists public.cloud_expenses (
  id text primary key,
  project_id text references public.cloud_projects(id) on delete cascade,
  title text not null,
  amount numeric not null,
  category text not null,
  date text not null,
  time text not null default '',
  paid_by text not null,
  owed_by text not null default '',
  participants jsonb not null default '[]'::jsonb,
  payment_method text not null default 'UPI',
  notes text default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cloud_messages (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.cloud_projects(id) on delete cascade,
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cloud_activities (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.cloud_projects(id) on delete cascade,
  action_type text not null,
  description text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cloud_tasks (
  id text primary key,
  project_id text references public.cloud_projects(id) on delete cascade,
  title text not null,
  due_date text not null,
  due_time text default '',
  status text not null default 'Pending',
  priority text not null default 'Medium',
  notes text default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cloud_documents (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.cloud_projects(id) on delete cascade,
  title text not null,
  url text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.cloud_projects enable row level security;
alter table public.cloud_participants enable row level security;
alter table public.cloud_expenses enable row level security;
alter table public.cloud_messages enable row level security;
alter table public.cloud_activities enable row level security;
alter table public.cloud_tasks enable row level security;
alter table public.cloud_documents enable row level security;

-- Policies for public access (using the anon key)
create policy "Allow all access to public projects" on public.cloud_projects for all using (true) with check (true);
create policy "Allow all access to public participants" on public.cloud_participants for all using (true) with check (true);
create policy "Allow all access to public expenses" on public.cloud_expenses for all using (true) with check (true);
create policy "Allow all access to public messages" on public.cloud_messages for all using (true) with check (true);
create policy "Allow all access to public activities" on public.cloud_activities for all using (true) with check (true);
create policy "Allow all access to public tasks" on public.cloud_tasks for all using (true) with check (true);
create policy "Allow all access to public documents" on public.cloud_documents for all using (true) with check (true);

-- Enable realtime subscriptions for updates
alter publication supabase_realtime add table public.cloud_projects;
alter publication supabase_realtime add table public.cloud_participants;
alter publication supabase_realtime add table public.cloud_expenses;
alter publication supabase_realtime add table public.cloud_messages;
alter publication supabase_realtime add table public.cloud_activities;
alter publication supabase_realtime add table public.cloud_tasks;
alter publication supabase_realtime add table public.cloud_documents;
