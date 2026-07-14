-- Results Idiomas — Schema inicial (M1: Agente Comercial)
-- ADR-002: Supabase (PostgreSQL) + Zod, sem ORM

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================================================
-- contacts
-- =========================================================
create table contacts (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique,
  name        text,
  type        text not null default 'lead'
              check (type in ('lead', 'student')),
  pausar_ia   text not null default 'Não'
              check (pausar_ia in ('Sim', 'Não')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_contacts_phone on contacts (phone);
create index idx_contacts_type on contacts (type);
create index idx_contacts_pausar_ia on contacts (pausar_ia);

create trigger trg_contacts_updated_at
  before update on contacts
  for each row execute function set_updated_at();

alter table contacts enable row level security;

-- =========================================================
-- conversations
-- =========================================================
create table conversations (
  id              uuid primary key default gen_random_uuid(),
  contact_id      uuid not null references contacts (id) on delete cascade,
  agent_type      text not null
                  check (agent_type in ('commercial', 'support')),
  messages        jsonb not null default '[]'::jsonb,
  lead_score      int not null default 0
                  check (lead_score between 0 and 10),
  collected_data  jsonb not null default '{}'::jsonb,
  stage           text not null default 'novo_lead',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_conversations_contact_id on conversations (contact_id);
create index idx_conversations_stage on conversations (stage);

create trigger trg_conversations_updated_at
  before update on conversations
  for each row execute function set_updated_at();

alter table conversations enable row level security;

-- =========================================================
-- lead_followups
-- =========================================================
create table lead_followups (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts (id) on delete cascade,
  scheduled_at  timestamptz not null,
  message_type  text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'sent', 'cancelled')),
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index idx_lead_followups_contact_id on lead_followups (contact_id);
create index idx_lead_followups_status on lead_followups (status);
create index idx_lead_followups_scheduled_at on lead_followups (scheduled_at);

alter table lead_followups enable row level security;

-- =========================================================
-- knowledge_chunks (ADR-009: vector store RAG, Supabase pgvector)
-- =========================================================
create extension if not exists vector;

create table knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  agent_type  text not null
              check (agent_type in ('commercial', 'support', 'shared')),
  source      text not null,
  heading     text,
  content     text not null,
  embedding   vector(1536) not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_knowledge_chunks_agent_type on knowledge_chunks (agent_type);
create index idx_knowledge_chunks_source on knowledge_chunks (source);
create index idx_knowledge_chunks_embedding on knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

create trigger trg_knowledge_chunks_updated_at
  before update on knowledge_chunks
  for each row execute function set_updated_at();

alter table knowledge_chunks enable row level security;

create or replace function match_knowledge_chunks(
  query_embedding vector(1536),
  match_agent_type text,
  match_count int default 4
)
returns table (
  id uuid,
  source text,
  heading text,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    knowledge_chunks.id,
    knowledge_chunks.source,
    knowledge_chunks.heading,
    knowledge_chunks.content,
    1 - (knowledge_chunks.embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where knowledge_chunks.agent_type = match_agent_type
     or knowledge_chunks.agent_type = 'shared'
  order by knowledge_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- =========================================================
-- RLS: acesso apenas via service_role (backend). Sem policies
-- de leitura pública nesta fase — CRM/frontend consome via API
-- backend, não direto no Supabase client anônimo.
-- =========================================================
