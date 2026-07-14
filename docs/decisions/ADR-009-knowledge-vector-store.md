# ADR-009: Vector Store da Base de Conhecimento (RAG)

## Status
**Aceito** — 2026-07-13

## Contexto

Agentes M1/M2 precisam responder com precisão sobre preços, cursos, scripts de
atendimento e políticas da Results. Esse conteúdo:
- É extenso (docs anexados pela Results — B1/B2/B3 do ROADMAP)
- Muda ao longo do tempo (preços, turmas, políticas)
- Não cabe inteiro no system prompt sem estourar custo/latência de token

ADR-006 rejeitou embeddings para **memória de conversa** (overkill, ADR-006 §
"Por que não usar outros mecanismos"). Isso continua válido — histórico de
conversa segue via Supabase (jsonb) + Redis, sem mudança.

Este ADR cobre um problema diferente: **busca semântica em base de
conhecimento estática** (preços/cursos/scripts), não histórico de conversa.

## Decisão

**pgvector no Supabase**, reaproveitando o Postgres já provisionado (ADR-002).
Sem serviço de vector DB externo (Pinecone/Weaviate) — reduz superfície de
infra e credenciais.

```
Documentos (agents/commercial/*.md, agents/shared/*.md)
  → chunker (split por heading, ~500-800 tokens, overlap 50)
  → OpenAI embeddings (text-embedding-3-small, 1536 dim)
  → upsert em knowledge_chunks (Supabase, coluna vector)

Turno do agente:
  → embed da mensagem do usuário
  → RPC match_knowledge_chunks (cosine similarity, top-k)
  → chunks injetados no system prompt como contexto
```

### Por que `text-embedding-3-small`
Mesmo provedor do ADR-008 (OpenAI), custo baixo (~$0.02/1M tokens), 1536 dim
suficiente pra separar tópicos (curso, preço, política) sem precisar do
`-large`.

### Por que HNSW (não IVFFlat)
Volume de conhecimento é pequeno (dezenas/centenas de chunks, não milhões).
HNSW não precisa de `ANALYZE`/tuning de `lists` como IVFFlat e tem melhor
recall em bases pequenas.

### Escopo por agente
Coluna `agent_type` (`commercial` | `support` | `shared`) filtra o RPC —
agente comercial não recupera conteúdo de suporte e vice-versa; `shared`
sempre incluso (info da escola comum aos dois).

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| Prompt gigante com toda a KB inline | Estoura contexto/custo à medida que a KB cresce; sem atualização incremental |
| Pinecone/Weaviate externo | Infra extra, credencial extra, sem ganho real no volume esperado |
| Busca full-text Postgres (`tsvector`) | Não captura similaridade semântica (sinônimo, paráfrase) — pior pra linguagem natural de lead |

## Consequências

- Nova extensão `vector` no Supabase (migration `20260713000001`)
- Nova tabela `knowledge_chunks` + função RPC `match_knowledge_chunks`
- Novo domínio `backend/src/knowledge/`
- Script de ingestão roda manualmente quando Results entrega/atualiza docs
  (`npm run ingest:knowledge` dentro de `backend/`)
- `commercial.service.ts` (e futuramente `support.service.ts`) passam a
  recuperar contexto antes de montar o prompt

## Variáveis

```env
OPENAI_EMBEDDING_MODEL=text-embedding-3-small   # default no código, override opcional
KNOWLEDGE_MATCH_COUNT=4                          # top-k chunks recuperados por turno
```
