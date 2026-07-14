-- Results Idiomas — Vector store da base de conhecimento (RAG)
-- ADR-009: pgvector no Supabase, embeddings OpenAI text-embedding-3-small (1536 dim)

create extension if not exists vector;

-- =========================================================
-- knowledge_chunks
-- =========================================================
create table knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  agent_type  text not null
              check (agent_type in ('commercial', 'support', 'shared')),
  source      text not null,              -- ex: 'agents/commercial/scoring-rules.md'
  heading     text,                       -- heading do chunk, se houver (contexto pro humano/debug)
  content     text not null,
  embedding   vector(1536) not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_knowledge_chunks_agent_type on knowledge_chunks (agent_type);
create index idx_knowledge_chunks_source on knowledge_chunks (source);

-- HNSW cosine — base pequena (dezenas/centenas de chunks), sem tuning de lists do IVFFlat
create index idx_knowledge_chunks_embedding on knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

create trigger trg_knowledge_chunks_updated_at
  before update on knowledge_chunks
  for each row execute function set_updated_at();

alter table knowledge_chunks enable row level security;
-- sem policies de leitura pública — acesso só via service_role (backend), mesmo padrão das demais tabelas

-- =========================================================
-- match_knowledge_chunks — busca semântica top-k por agent_type
-- =========================================================
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
