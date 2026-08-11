-- Results Idiomas — Console de teste: fase da conversa, observações e conversas salvas
--
-- Três lacunas do console de teste, todas vindas do mesmo lugar: a equipe
-- consegue conversar com o agente, mas não consegue *registrar* o que observou.
--
-- 1. `conversations.conversation_phase` — em que passo do roteiro o agente
--    acha que está. Declarado pelo próprio modelo a cada turno (ver
--    `conversation_phase` em `commercial/prompt-v1.md`), não derivado dos
--    dados coletados: o que o lead já respondeu não diz onde a conversa está.
--    Coluna separada de `stage` de propósito — `stage` é etapa do funil de CRM
--    (`novo_lead`, `qualificado`), conceito de negócio diferente.
--
-- 2. `test_conversation_notes` — observação da equipe numa resposta específica
--    do agente ("aqui ele repetiu pergunta", "inventou horário"). Sem isso o
--    achado do teste vive no print ou no WhatsApp da equipe e se perde.
--
-- 3. `test_conversation_saves` — snapshot nomeado de uma sessão de teste, com
--    mensagens, estado e observações. Sessão de teste é apagada ("Zerar
--    sessão") e reaproveitada o tempo todo; sem snapshot, comparar o
--    comportamento antes e depois de editar o prompt é impossível.

-- =========================================================
-- conversations.conversation_phase
-- =========================================================
alter table conversations
  add column if not exists conversation_phase text;

comment on column conversations.conversation_phase is
  'Passo do roteiro declarado pelo agente no último turno (abertura, qualificacao, conexao, preco, experimental, objecao). Diferente de stage, que é etapa do funil de CRM.';

-- =========================================================
-- test_conversation_notes — observação por mensagem
-- =========================================================
-- Chave é (session_id, message_index) e não o id de uma mensagem: mensagem
-- vive dentro de um jsonb em `conversations.messages` e não tem identidade
-- própria. O índice é a posição na conversa já mesclada (comercial + suporte
-- ordenados por horário), que é exatamente o que a tela mostra.
create table if not exists test_conversation_notes (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null,
  message_index int  not null check (message_index >= 0),
  note          text not null check (length(trim(note)) > 0),
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (session_id, message_index)
);

create index if not exists idx_test_conversation_notes_session
  on test_conversation_notes (session_id);

create trigger trg_test_conversation_notes_updated_at
  before update on test_conversation_notes
  for each row execute function set_updated_at();

alter table test_conversation_notes enable row level security;

-- =========================================================
-- test_conversation_saves — snapshot nomeado
-- =========================================================
-- `payload` guarda a conversa inteira congelada (mensagens com agente e
-- horário, score, dados coletados, fase e observações). Cópia e não referência
-- de propósito: o valor do snapshot é registrar como o agente respondia
-- *naquele* prompt. Se apontasse para a sessão viva, "Zerar sessão" apagaria
-- o histórico que a equipe quis guardar.
create table if not exists test_conversation_saves (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,
  title       text not null check (length(trim(title)) > 0),
  payload     jsonb not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_test_conversation_saves_created_at
  on test_conversation_saves (created_at desc);

alter table test_conversation_saves enable row level security;
