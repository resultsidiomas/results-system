# ADR-010: n8n passa a chamar a engine completa do agente comercial

## Status
**Aceito** — 2026-07-15

## Contexto

Desde a reconstrução do workflow n8n `Agente - Entrada via Webhook` em 2026-07-15
(ver CHANGELOG, "Infra: n8n com acúmulo de mensagens"), o tráfego real de
WhatsApp passou a fluir **UAZAPI → n8n → backend**, não mais **UAZAPI →
backend** diretamente. O n8n hoje cuida de: ack imediato, filtro `fromMe`,
filtro de número de teste, debounce/junção de mensagens (Redis, 30s) e envio
da resposta via UAZAPI.

O n8n chama `POST /api/v1/n8n-agent/run` pra obter a resposta do agente. Esse
endpoint (`n8n-agent.routes.ts`) foi criado numa tentativa anterior (serviço
`agent-service` separado, depois descartado) e ficou como um **passthrough
cru**: chama `openai.chat.completions.create` sem system prompt, sem persona,
sem RAG da base de conhecimento e sem o schema estruturado que controla envio
de tabela de preço e coleta de dados de qualificação.

A engine completa já existe e está testada, mas plugada apenas no caminho
antigo (`uazapi.webhook.ts` → `/api/v1/webhook/whatsapp`), que não recebe mais
tráfego real desde que o UAZAPI passou a apontar pro n8n:
`commercial.service.ts` (`runCommercialTurn`) usa `agents/commercial/prompt-v1.md`
(persona Jessica, ordem de qualificação, regra de preço), recupera contexto
via RAG (`knowledge.retrieval.ts`), calcula `send_price_table` e dispara
`sendPriceTableImages` diretamente via UAZAPI.

Resultado prático: qualquer ajuste em prompt/persona/regras de preço não
tinha efeito nenhum no WhatsApp real, porque o caminho em produção ignorava
esses arquivos por completo.

## Decisão

Reescrever `n8n-agent.routes.ts` pra chamar `runCommercialTurn` em vez do
passthrough cru, mantendo a divisão de responsabilidade já testada em
2026-07-15:

```
n8n (já existe, não muda):
  webhook → filtro fromMe → filtro allowlist → debounce 30s (Redis)
  → POST /api/v1/n8n-agent/run { message, sessionId, contexto }
  → [NOVO] quebra reply em blocos + loop com delay aleatório 3000-5500ms
  → POST UAZAPI /send/text por bloco

backend (/api/v1/n8n-agent/run, reescrito):
  → findOrCreateContact(phone, senderName)      [Supabase]
  → guard: pausar_ia === 'Sim' → responde sem reply (n8n não envia nada)
  → runCommercialTurn(contact, instance, remoteJid, message)
      → prompt-v1.md + RAG + scoring + send_price_table
      → sendPriceTableImages direto via UAZAPI (backend, já existia)
  → retorna { reply, sendPriceTable, sessionId }
```

**Sem roteador M1/M2 nesse endpoint por enquanto.** O agente de suporte (M2)
não existe ainda (`agents/support/` só tem `.gitkeep`) — rotear pra "support"
aqui produziria silêncio (mesmo gap que já existe em `uazapi.webhook.ts`,
linha final "M2 plugs in here in a future session"). Manter esse endpoint
sempre respondendo via `runCommercialTurn` evita introduzir uma regressão nova
fora do escopo pedido; o roteador entra quando M2 for implementado.

O envio de texto continua sendo feito pelo n8n (já testado ponta-a-ponta
hoje), não pelo backend — só o `sendFractured`/`sendText` do backend
(`uazapi.sender.ts`) segue existindo pro caminho antigo (`uazapi.webhook.ts`,
hoje sem tráfego real), sem uso nesse endpoint novo.

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| Apontar o node "Chamar Agente" do n8n pra `/api/v1/webhook/whatsapp` | Esse endpoint espera o payload cru da UAZAPI (não o já deduplicado/joinado do n8n), tem seu próprio guard de auth por token de webhook, seu próprio debounce (45s, duplicaria o do n8n) e já envia a resposta fracionada via UAZAPI diretamente — daria duplo envio e dupla espera. |
| Migrar tudo de volta pro backend, desativando o n8n | Contraria decisão do usuário de manter o n8n como camada de entrada (já reconstruído e testado hoje); descartaria debounce/allowlist recém-validados ponta-a-ponta. |

## Consequências

- `backend/src/integrations/n8n-agent/n8n-agent.routes.ts` ganha dependência
  de `contacts.repository.ts` e `commercial.service.ts`.
- Toda mensagem que passa pelo n8n agora grava contato/conversa/score no
  Supabase (antes o passthrough não persistia nada em `contacts`/`conversations`).
- Workflow n8n precisa de um Code node novo (fracionamento + delay aleatório)
  — alterado via API/editor do n8n, não versionado no repo (mesma limitação
  já registrada nos commits de 2026-07-15).
- Prompt (`prompt-v1.md`, `persona.md`, `forbidden-phrases.md`) passa a ter
  efeito real em produção pela primeira vez desde a virada pro n8n.
