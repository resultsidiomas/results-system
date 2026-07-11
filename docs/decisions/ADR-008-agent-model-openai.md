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

Substitui a escolha de modelo de ADR-005 e a linha "Roteador IA" de ADR-007.
Resto da arquitetura de ADR-007 (Redis, junção de mensagens, pausa humana,
fluxo do webhook, Groq Whisper para áudio, Claude Vision para imagem) **não
muda** — só o provider do texto conversacional e do classificador de intenção.

## Consequências

- Dependência nova: `openai` (^4) no lugar de `@anthropic-ai/sdk` para chat
  dos agentes e roteador
- Env var nova: `OPENAI_API_KEY` (substitui `ANTHROPIC_API_KEY` no papel de
  motor de chat — Claude Vision, se mantido para imagem, ainda usaria chave
  Anthropic separada)
- `backend/src/config/openai.ts` — cliente singleton
- Roteador (`intent.classifier.ts`) chama `gpt-4.1-mini`, timeout 3s, default
  `'commercial'` em falha
- ADR-005 marcado como Superseded by ADR-008
- ADR-007 mantém-se válido exceto pela linha de modelo do roteador (nota
  adicionada apontando para este ADR)

## Alternativas
Não avaliadas nesta sessão — decisão vinda de escolha explícita do usuário,
não de análise técnica comparativa. Se necessário revisitar custo/qualidade
Claude vs OpenAI, abrir novo ADR.
