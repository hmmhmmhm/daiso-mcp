create table if not exists public.agent_requests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('bug', 'improvement', 'feature', 'docs', 'other')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  description text not null,
  service text,
  tool_name text,
  reproduction text,
  expected text,
  actual text,
  source text check (source in ('mcp', 'chatgpt', 'claude', 'cli', 'api', 'other')),
  user_context jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists agent_requests_created_at_idx on public.agent_requests (created_at desc);
create index if not exists agent_requests_status_idx on public.agent_requests (status);
create index if not exists agent_requests_service_idx on public.agent_requests (service);
