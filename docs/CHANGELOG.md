# CHANGELOG

Toda alteracao importante registrada aqui.

## Formato
## [YYYY-MM-DD] - M[n]: [nome da mudanca]
O que: descricao
Por que: justificativa
Arquivos: lista
Impacto: o que essa mudanca afeta

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
