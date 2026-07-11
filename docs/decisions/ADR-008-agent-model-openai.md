# ADR-008: Modelo dos Agentes — OpenAI gpt-4.1-mini (substitui ADR-005)

## Status
**Aceito** — 2026-07-11

## Contexto

ADR-005 e ADR-007 definiram Claude API (`claude-sonnet-4-6` nos agentes,
`claude-haiku-4-5-20251001` no roteador) como modelo dos agentes M1/M2.

CLAUDE.md (seção de ADRs confirmados) já listava `ADR-005 | OpenAI
gpt-4.1-mini (agentes + roteador)` — divergente do conteúdo real do arquivo
ADR-005. Sessão 001 confirmou explicitamente: usar OpenAI.

## Decisão

**OpenAI `gpt-4.1-mini`** para:
- Agente Comercial (M1)
- Agente Suporte (M2)
- Roteador / classificador de intenção
- Análise de imagem (Vision) — substitui Claude Vision

Substitui a escolha de modelo de ADR-005 e as linhas "Roteador IA" e "Análise
de imagem" de ADR-007. Resto da arquitetura de ADR-007 (Redis, junção de
mensagens, pausa humana, fluxo do webhook, Groq Whisper para áudio) **não
muda** — só sai toda dependência de Claude/Anthropic, entra OpenAI para todo
o texto e visão.

## Consequências

- Dependência nova: `openai` (^4). Nenhuma dependência Anthropic entra no
  projeto — `image.analyzer.ts` também usa `openai` (Vision), não SDK
  separado
- Env var: `OPENAI_API_KEY` único — cobre chat (M1/M2), roteador e visão
- `backend/src/config/openai.ts` — cliente singleton (já criado na Parte 2)
- Roteador (`intent.classifier.ts`) chama `gpt-4.1-mini`, timeout 3s, default
  `'commercial'` em falha
- ADR-005 marcado como Superseded by ADR-008
- ADR-007 mantém-se válido exceto pelas linhas de modelo do roteador e de
  análise de imagem (nota adicionada apontando para este ADR)

## Alternativas
Não avaliadas nesta sessão — decisão vinda de escolha explícita do usuário,
não de análise técnica comparativa. Se necessário revisitar custo/qualidade
Claude vs OpenAI, abrir novo ADR.
