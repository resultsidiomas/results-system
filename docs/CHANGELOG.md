# CHANGELOG

Toda alteracao importante registrada aqui.

## Formato
## [YYYY-MM-DD] - M[n]: [nome da mudanca]
O que: descricao
Por que: justificativa
Arquivos: lista
Impacto: o que essa mudanca afeta

## [2026-07-14] - M1: RAG ativo no Supabase real + webhook por query string
O que: migration `20260713000001_knowledge_vector_store.sql` aplicada no Supabase real (SQL Editor, em 2 partes por causa de corte no copy/paste). `npm run ingest:knowledge` rodado — 30 chunks (commercial: 19, shared: 11; support vazio, M2 não iniciado). Retrieval testado ponta-a-ponta contra o Supabase real (`retrieveKnowledgeContext` retornou contexto de preço de verdade). Webhook agora aceita o secret via `?token=` na URL, não só header — painel da UAZAPI só tem campo de URL simples, sem header customizado.
Por que: painel real da UAZAPI não suporta header customizado (só descoberto testando de verdade); RAG era o último bloqueador pro agente responder preço/curso com precisão.
Arquivos: backend/src/whatsapp/uazapi/uazapi.webhook.ts (`?token=` fallback), ROADMAP.md (M1 entregas atualizadas).
Impacto: M1 agora responde de verdade via WhatsApp real, restrito a 2 números de teste (`TEST_ALLOWED_NUMBERS`). Vector store confirmado com dados reais da Results.

## [2026-07-14] - M1: deploy EasyPanel + tabela de preços por imagem
O que: (1) Dockerfile multi-stage pro backend (non-root, sem devDependencies, healthcheck). (2) Corrigido bug real — env.ts exigia `WA_*`/`GROQ_API_KEY`/`DATABASE_URL` (nunca usado no código) como obrigatórios, servidor quebrava no boot; tornados opcionais/removido o morto. (3) Corrigido bug real — `commercial.service.ts` carregava `prompt-v1.md` com profundidade de `../` errada (nunca resolvia o arquivo real, nunca testado rodando de verdade). (4) Movido `agents/` pra dentro de `backend/agents/` — Dockerfile builda com contexto = `backend/`, não alcança pastas irmãs no repo raiz (restrição rígida do Docker, não dá pra COPY fora do contexto). Corrige o bug (3) e viabiliza o Docker build ao mesmo tempo. (5) Agente agora manda foto real da tabela de preços (`backend/assets/price-table/`, 4 das 5 imagens — excluída a de "Conversação", valor ainda não confirmado) em vez de citar valor em texto — campo novo `send_price_table` no schema do turno, nunca reexplicitado o número no `reply`.
Por que: usuário conectou credenciais reais da UAZAPI e pediu deploy real na VPS pra testar; pediu explicitamente que o agente pare de arriscar valor errado em texto e mande a tabela real como a equipe já faz.
Arquivos: backend/Dockerfile (novo), backend/.dockerignore (novo), backend/src/config/env.ts, backend/src/media/audio.transcriber.ts, backend/scripts/ingest-knowledge.ts, backend/agents/** (movido de agents/**), backend/assets/price-table/*.jpeg (novo), backend/src/whatsapp/uazapi/price-table.assets.ts (novo), backend/src/whatsapp/uazapi/uazapi.sender.ts (`sendPriceTableImages`), backend/src/agents/commercial/commercial.schema.ts, commercial.service.ts, backend/src/agents/shared/agent.types.ts, backend/src/testing/test-chat.routes.ts, backend/agents/commercial/prompt-v1.md, CLAUDE.md, ROADMAP.md, .env.example.
Impacto: typecheck limpo, build local ok, path de `prompt-v1.md` confirmado resolvendo pro arquivo real após a correção (antes resolvia pra um caminho inexistente). Endpoint UAZAPI `/send/media` usado por convenção observada (mesmo padrão de header/body de `/send/text`) — documentação oficial é SPA não indexável, não confirmado contra API real ainda; primeiro teste com WhatsApp real vai validar. Console de teste (`sendImages: false`) não dispara envio real de imagem, só reporta `sendPriceTable` na resposta — combina com pedido do usuário de testar só o conversacional por enquanto.

## [2026-07-11] - Arquitetura: ADR-008 (modelo dos agentes)
O que: modelo dos agentes M1/M2 + roteador trocado de Claude (ADR-005) para OpenAI gpt-4.1-mini.
Por que: decisão explícita do usuário na Sessão 001, divergente do que ADR-005/007 tinham registrado; CLAUDE.md já citava OpenAI de forma inconsistente.
Arquivos: docs/decisions/ADR-008-agent-model-openai.md (novo), ADR-005 (status Superseded), ADR-007 (nota), docs/DECISIONS.md, CLAUDE.md, ROADMAP.md, prompts/PROMPT-01-PLANEJAMENTO.md.
Impacto: dependência `openai` no lugar de `@anthropic-ai/sdk` para chat dos agentes; env `OPENAI_API_KEY`; resto de ADR-007 (Redis, webhook, Groq, Claude Vision) inalterado.

## [2026-07-11] - Infra: bootstrap Fastify
O que: servidor Fastify base com clients singleton (Supabase, OpenAI, Redis), plugins cors/error-handler, env validado com Zod, logger com redação de PII.
Por que: base necessária antes do webhook UAZAPI (Parte 3) e agentes (Parte 5).
Arquivos: backend/package.json, backend/tsconfig.json, backend/server.ts, backend/src/config/*.ts, backend/src/plugins/*.ts, backend/src/shared/*.ts.
Impacto: `npx tsx backend/server.ts` sobe e responde GET /health; falha rápido se .env incompleto.

## [2026-07-11] - M1: webhook UAZAPI + guards + message-join
O que: rota POST /api/v1/webhook/whatsapp com cadeia de guards (auth token, Zod, instância, contato, pausar_ia), resolução de mídia (Groq Whisper / OpenAI Vision), junção anti-flood 45s via Redis, e tratamento fromMe (auto-block + log em memória) inspirado no fluxo de referência Vespa.json (não commitado, tinha secret de outro cliente — adicionado ao .gitignore).
Por que: base de recepção de mensagens antes do roteador M1/M2 (Parte 4).
Arquivos: backend/src/whatsapp/uazapi/*, backend/src/agents/shared/*, backend/src/crm/leads/contacts.repository.ts, backend/src/media/*, backend/server.ts, backend/tests/e2e/webhook.smoke.ts.
Impacto: smoke test confirma guards de auth/validação/instância. Achado: Supabase real acessível mas tabela `contacts` (schema da Parte 1) ainda não aplicada no projeto — pendente.

## [2026-07-11] - Infra: schema aplicado no Supabase real, Redis só VPS
O que: database/schema.sql aplicado manualmente pelo usuário no SQL Editor do Supabase (projeto real). Confirmado via smoke test — contact lookup/create funciona.
Por que: schema da Parte 1 só existia local até então.
Impacto: Redis de produção vive só na VPS (hostname interno EasyPanel, `drop-agency_redis_results`), não resolve de máquina de dev local (sem Docker instalado aqui). Fluxo completo (block/pause/message-join, 45s wait) segue não testado localmente — validar quando backend rodar na VPS. Guards de auth/validação/instância/contato já confirmados via backend/tests/e2e/webhook.smoke.ts.

## [2026-07-11] - M1: roteador comercial/suporte
O que: agent.router.ts (contact.type=student → support direto; lead → intent.classifier.ts via OpenAI gpt-4.1-mini, timeout 3s, default commercial). Plugado no webhook após message-join.
Por que: decide silenciosamente qual agente (M1/M2) responde, sem o usuário perceber a troca.
Arquivos: backend/src/agents/router/agent.router.ts, intent.classifier.ts, backend/src/whatsapp/uazapi/uazapi.webhook.ts, backend/tests/unit/agent.router.smoke.ts.
Impacto: guard type=student confirmado (sem chamar API). Classificação real de intenção não verificada — OPENAI_API_KEY no .env ainda é placeholder; fallback pra 'commercial' em erro/timeout confirmado funcionando.

## [2026-07-14] - M1: persona Jessica + API do console de teste do agente
O que: persona do agente renomeada de "equipe Results Idiomas" (genérico) pra **Jessica, da equipe Results Idiomas** — decisão confirmada pelo usuário (nome próprio pra familiaridade, sem reusar o nome da Gislaine/pessoa real). Nova API `backend/src/testing/test-chat.routes.ts`: `GET/POST /api/v1/test-chat/:sessionId/messages` e `DELETE /api/v1/test-chat/:sessionId`, autenticada por header `x-test-console-token` (`TEST_CONSOLE_TOKEN` no `.env`, novo). Reusa `runCommercialTurn` com `notifyHandoff: false` (não dispara alerta real pra Gi durante teste). Reset apaga histórico Redis + bloqueio + o contato de teste inteiro (cascade em `conversations`/`lead_followups`).
Por que: usuário quer um console de teste (frontend, escopo do Codex) pra validar o agente sem usar WhatsApp real, com botão de reiniciar que limpa toda a memória da conversa.
Arquivos: agents/commercial/prompt-v1.md, agents/shared/persona.md, agents/shared/forbidden-phrases.md, backend/src/config/env.ts, backend/src/testing/test-chat.schema.ts (novo), backend/src/testing/test-chat.routes.ts (novo), backend/src/agents/commercial/commercial.service.ts (opção `notifyHandoff`), backend/src/agents/shared/agent.types.ts (campo `handoff`), backend/src/agents/shared/agent.memory.redis.ts (`clearChatHistory`), backend/src/agents/shared/agent.pause.ts (`clearBlock`), backend/src/crm/leads/contacts.repository.ts (`findContactByPhone`, `deleteContact`), backend/server.ts, .env.example.
Impacto: rotas testadas ponta a ponta localmente — auth 401 sem token confirmado, criação de contato/conversa isolada (`test-{sessionId}`) confirmada contra Supabase real. Chamadas que dependem de Redis (`getChatHistory`, `clearChatHistory`) falham em dev local (mesma limitação já documentada — Redis só resolve de dentro da VPS), vão funcionar normal no deploy. Frontend roteado pro Codex (fora do escopo do Claude Code) — contrato de API documentado em prompt de handoff.

## [2026-07-13] - M1: base de conhecimento real (persona, preços, script) + prompt-v1
O que: processados os documentos reais anexados pela Results em `docs.agente/` (tabela de preços — 5 imagens, roteiro de vendas oficial — 2 docx, 5 conversas reais de WhatsApp — 76 imagens ao todo). Escrito `agents/commercial/prompt-v1.md` (system prompt real, substitui placeholder), `knowledge-base.md` (tabela de preços completa por plano/frequência/modalidade, com valores não confirmados marcados ⚠️), `objections.md`, `scoring-rules.md` (documenta o que já existia em código), `handoff-rules.md` (gatilhos além do score, ex: pedido de desconto fora da tabela, dado de pagamento sensível). Em `agents/shared/`: `school-info.md`, `persona.md`, `forbidden-phrases.md`. `commercial.service.ts` agora lê `prompt-v1.md` do disco em vez de string hardcoded.
Por que: pedido do usuário — agente comercial deve conversar no padrão real observado nos atendimentos da Gi, com preços e diferenciais corretos, não genéricos.
Arquivos: agents/commercial/*.md, agents/shared/*.md (novos/reescritos), backend/src/agents/commercial/commercial.service.ts, ROADMAP.md (B2/B3 marcados resolvidos).
Impacto: dados extraídos por sub-agentes lendo as imagens diretamente, com instrução explícita de anonimização — nenhum nome/telefone/e-mail real de cliente foi copiado pros arquivos versionados. Decisão de persona: agente se apresenta como "equipe Results Idiomas", não como "Gislaine" literal (risco de impersonação sem disclosure de IA) — sinalizado no ROADMAP pra confirmação do time. Valores de materiais Business/Kids/Grammar e do plano "Conversação" marcados como não confirmados (só apareceram em script antigo ou imagem com rótulo ambíguo), não devem ser usados com lead até confirmação da Results. Typecheck limpo, smoke tests existentes (scoring, router, handoff) rodados sem regressão, incluindo chamada real à OpenAI (classificação de intenção funcionando). Prompt real ainda não testado ponta-a-ponta com vector store populado — migration `20260713000001` segue pendente de aplicação manual no Supabase real.

## [2026-07-13] - Infra: vector store RAG da base de conhecimento (ADR-009)
O que: pgvector no Supabase (extensão `vector`, tabela `knowledge_chunks`, índice HNSW cosine, função RPC `match_knowledge_chunks`). Novo domínio `backend/src/knowledge/` (chunker por heading markdown, embeddings OpenAI `text-embedding-3-small`, repository, retrieval, ingest). Script `npm run ingest:knowledge` lê `agents/{commercial,support,shared}/*.md`, gera embeddings e faz upsert idempotente por `source`. `commercial.service.ts` agora recupera contexto relevante (top-k, filtrado por `agent_type`) e injeta no system prompt antes de cada turno.
Por que: agentes M1/M2 precisam responder preço/curso/política com precisão, sem depender de tudo caber no system prompt — pedido explícito do usuário pra quando os docs reais (B1/B2/B3) forem anexados ao projeto.
Arquivos: docs/decisions/ADR-009-knowledge-vector-store.md (novo), database/migrations/20260713000001_knowledge_vector_store.sql (novo), database/schema.sql, backend/src/knowledge/*.ts (novo), backend/scripts/ingest-knowledge.ts (novo), backend/src/config/env.ts, backend/src/agents/commercial/commercial.service.ts, backend/tests/unit/knowledge.chunker.smoke.ts (novo).
Impacto: chunker testado (9 casos, sem API). Embeddings/RPC não testados contra Supabase real ainda — sem `.md` em `agents/commercial|support|shared/` pra ingerir (bloqueado por B1/B2/B3 no ROADMAP). Retrieval falha de forma segura: erro/timeout retorna contexto vazio, não quebra o turno. Migration ainda não aplicada no Supabase real — pendente rodar `database/migrations/20260713000001_knowledge_vector_store.sql` manualmente (mesmo processo da Parte 1).

## [2026-07-12] - M1: motor do agente comercial
O que: commercial.service.ts orquestra turno via OpenAI (structured output json_schema), score calculado deterministicamente em código (não confia em autoavaliação do LLM), persistência dupla Redis (contexto) + Supabase (histórico/score/collected_data), handoff pra Gi em score>=7 (pausar_ia='Sim' + alerta via GI_ALERT_NUMBER, opcional). Webhook agora envia resposta real fracionada via UAZAPI quando agentType=commercial.
Por que: entrega o core do M1 — qualificação de lead ponta a ponta.
Arquivos: backend/src/agents/commercial/*, backend/src/agents/shared/agent.context.ts, agent.fracture.ts, agent.memory.pg.ts, backend/src/whatsapp/uazapi/uazapi.sender.ts (sendText exportado, reusa fracture), uazapi.webhook.ts.
Impacto: CA-02 (scoring, 7 casos), CA-03 (pausar_ia='Sim' pós-handoff) e CA-04 (sem GI_ALERT_NUMBER não quebra) confirmados contra Supabase real. CA-01/CA-06 (resposta real do OpenAI) não verificados — OPENAI_API_KEY segue placeholder. Dados de teste (5511977776666, 5511988887777) removidos do Supabase após verificação.
