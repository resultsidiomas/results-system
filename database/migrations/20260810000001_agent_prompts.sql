-- Results Idiomas — Prompt dos agentes centralizado no banco
--
-- Antes: a instrução do agente vivia em 13 arquivos .md em `backend/agents/` e
-- a ORDEM de composição estava hardcoded dentro de `commercial.service.ts` e
-- `support.service.ts`. Editar qualquer regra exigia commit + deploy, e não
-- havia um lugar único para o humano olhar e ajustar.
--
-- Agora: `agent_prompt_blocks` guarda o conteúdo e `agent_prompt_composition`
-- guarda a ordem — as duas tabelas juntas são a fonte de verdade única. Os .md
-- do repositório viram semente inicial e fallback de emergência (se o Supabase
-- cair, o agente continua respondendo com a última versão versionada em git).
--
-- Toda escrita grava a versão anterior em `agent_prompt_versions`, então
-- edição manual errada tem rollback.

-- =========================================================
-- agent_prompt_blocks — conteúdo editável
-- =========================================================
create table agent_prompt_blocks (
  id          uuid primary key default gen_random_uuid(),
  -- Espelha o caminho do arquivo de origem (`shared/persona.md`) para a
  -- semente e o fallback em disco casarem 1:1 com a linha do banco.
  block_key   text not null unique,
  title       text not null,
  -- Quem pode usar o bloco. `shared` entra na composição dos dois agentes.
  agent_scope text not null
              check (agent_scope in ('commercial', 'support', 'shared')),
  -- Agrupamento para a tela de edição, não afeta o prompt montado.
  category    text not null
              check (category in ('comportamento', 'comercial', 'suporte', 'regras', 'conhecimento')),
  content     text not null,
  version     int  not null default 1,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_agent_prompt_blocks_scope on agent_prompt_blocks (agent_scope);
create index idx_agent_prompt_blocks_category on agent_prompt_blocks (category);

create trigger trg_agent_prompt_blocks_updated_at
  before update on agent_prompt_blocks
  for each row execute function set_updated_at();

alter table agent_prompt_blocks enable row level security;

-- =========================================================
-- agent_prompt_composition — ordem de montagem por agente
-- =========================================================
-- Um bloco `shared` aparece uma vez por agente, com posição própria: a ordem
-- importa para o prompt (a parte estável precisa vir antes do CONTEXTO
-- RELEVANTE, que é anexado depois e quebraria o cache da OpenAI se mudasse).
create table agent_prompt_composition (
  id          uuid primary key default gen_random_uuid(),
  agent_type  text not null check (agent_type in ('commercial', 'support')),
  block_key   text not null references agent_prompt_blocks (block_key) on delete cascade,
  position    int  not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agent_type, block_key),
  unique (agent_type, position) deferrable initially deferred
);

create index idx_agent_prompt_composition_agent on agent_prompt_composition (agent_type, position);

create trigger trg_agent_prompt_composition_updated_at
  before update on agent_prompt_composition
  for each row execute function set_updated_at();

alter table agent_prompt_composition enable row level security;

-- =========================================================
-- agent_prompt_versions — histórico para rollback
-- =========================================================
create table agent_prompt_versions (
  id          uuid primary key default gen_random_uuid(),
  block_key   text not null references agent_prompt_blocks (block_key) on delete cascade,
  version     int  not null,
  content     text not null,
  updated_by  text,
  created_at  timestamptz not null default now(),
  unique (block_key, version)
);

create index idx_agent_prompt_versions_block on agent_prompt_versions (block_key, version desc);

alter table agent_prompt_versions enable row level security;

-- =========================================================
-- Snapshot automático da versão anterior
-- =========================================================
-- Feito em trigger e não no service: garante histórico mesmo se alguém editar
-- direto pelo painel do Supabase, fora da API.
create or replace function snapshot_agent_prompt_version()
returns trigger as $$
begin
  if new.content is distinct from old.content then
    insert into agent_prompt_versions (block_key, version, content, updated_by)
    values (old.block_key, old.version, old.content, old.updated_by)
    on conflict (block_key, version) do nothing;

    new.version = old.version + 1;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_agent_prompt_blocks_snapshot
  before update on agent_prompt_blocks
  for each row execute function snapshot_agent_prompt_version();
