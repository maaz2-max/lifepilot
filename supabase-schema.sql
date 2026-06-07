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
