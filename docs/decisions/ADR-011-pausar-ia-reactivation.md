# ADR-011: Reativação da IA durante pausar_ia='Sim'

## Status
**Aceito** — 2026-07-15

## Contexto

`pausar_ia='Sim'` (Supabase, `contacts`) é setado hoje só por
`commercial.handoff.ts` quando o score do lead atinge ≥7 — a IA para de
responder até a rotina agendada das 08:00 resetar (ADR-007). Na prática,
depois do handoff, qualquer mensagem nova do lead ficava sem resposta
nenhuma até o dia seguinte, mesmo que fosse uma dúvida legítima (Gi pode
não ver a mensagem na hora).

Pedido do usuário: enquanto pausado, analisar a mensagem — se for dúvida
real, responder normalmente; se for só encerramento/agradecimento, manter
o silêncio.

### Risco identificado: reabrir o handoff a cada mensagem

`runCommercialTurn` roda `scoreLead` a cada turno. Uma vez que o lead
atinge score ≥7, `collected_data` já coletado faz o score continuar ≥7 nos
turnos seguintes — se simplesmente "destravasse" `pausar_ia` pra 'Não' e
deixasse o fluxo normal rodar, `commercial.handoff.ts` dispararia de novo
em **toda** mensagem seguinte: novo alerta pro `GI_ALERT_NUMBER` a cada
troca, e `pausar_ia` fica instável. Isso não é bug novo desta mudança — já
existia dormente no reset diário (primeira mensagem do dia seguinte já
teria score ≥7 de novo) — mas ativar reativação sob demanda tornaria esse
padrão frequente em vez de raro.

## Decisão

`n8n-agent.routes.ts`, quando `contact.pausar_ia === 'Sim'`:

1. Classifica a mensagem (`commercial.reactivation.ts`, `shouldReactivate`,
   mesmo padrão do `intent.classifier.ts` — modelo `OPENAI_MODEL_ROUTER`,
   timeout 3s, `duvida` vs `encerrado`). Falha/timeout → `false` (fica
   pausado; silêncio é o padrão seguro quando não dá pra classificar).
2. **Se não é dúvida** (`encerrado`): responde `{reply: null, pausarIa:
   'Sim'}` — nenhuma mensagem enviada, segue pausado.
3. **Se é dúvida**: roda `runCommercialTurn` com `pausar_ia` tratado como
   `'Não'` só nesse turno e `notifyHandoff: false` — responde a dúvida,
   mas **nunca** reabre o alerta pra Gi nem deixa o score re-disparar
   handoff sozinho. Depois de responder, `updatePausarIa(id, 'Sim')`
   devolve o contato pro estado pausado.
4. A próxima mensagem do lead passa pela mesma checagem (passo 1) — do
   ponto de vista do lead a conversa continua fluindo (cada dúvida real
   recebe resposta), mas internamente `pausar_ia` nunca fica "destravado"
   entre mensagens, então o mecanismo de score/handoff normal nunca reabre
   sozinho enquanto o lead segue pausado.

Endpoint sempre retorna `pausarIa: 'Sim' | 'Não'` (nunca omite o campo),
inclusive no fluxo normal (fora de pausa) — reflete o estado do contato
depois do turno.

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| Destravar `pausar_ia='Não'` de vez ao reativar, deixar fluxo normal decidir quando pausar de novo | Score fica ≥7 permanentemente uma vez atingido — reabriria handoff (e alerta pra Gi) em toda mensagem seguinte. |
| Nova coluna no schema pra marcar "já alertou Gi nesse episódio" | Resolveria de forma mais elegante, mas exige migration — fora do escopo pedido; a solução de snap-back a cada turno já evita o problema sem mudar schema. |
| Fazer a classificação dentro do n8n (node OpenAI direto) | Duplicaria lógica de prompt fora do repo (não versionado, ADR-010 já rejeitou esse padrão) — mantido no backend, testável e versionado. |

## Consequências

- `commercial.reactivation.ts` (novo): classificador dúvida/encerrado.
- `contacts.repository.ts`: `updatePausarIa(id, value)`.
- `n8n-agent.routes.ts`: resposta sempre inclui `pausarIa`. n8n não precisa
  de node novo — o Code node `Quebrar Resposta em Blocos` já trata
  `reply: null` como "não envia nada" (fix anterior no CHANGELOG).
- Cada mensagem recebida enquanto pausado custa uma chamada extra ao
  `OPENAI_MODEL_ROUTER` (classificação) — barato, mesmo modelo do roteador
  comercial/suporte.
