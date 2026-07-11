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
