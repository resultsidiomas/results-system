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
