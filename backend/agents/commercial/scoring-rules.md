## Lead Scoring — regras (espelha `backend/src/agents/commercial/commercial.scoring.ts`)

Score é calculado **em código, deterministicamente** — o modelo nunca
autoavalia o próprio score. O modelo só preenche `collected_data` a cada
turno (o que entendeu da conversa); o código soma pontos e decide handoff.
Não confiar no LLM pra dizer "esse lead é quente".

| Sinal coletado | Pontos |
|---|---|
| `interested_course` preenchido (idioma/curso de interesse) | +2 |
| `availability` preenchida (disponibilidade de horário) | +2 |
| `objective` preenchido (motivo de aprender) | +2 |
| `urgency = 'alta'` | +1 |
| `has_tried_before = true` (já tentou aprender antes) | +1 |
| mais de 3 mensagens trocadas na conversa | +1 |
| `price_asked = true` (lead perguntou preço) | +1 |

Score máximo: 10. **Handoff pra Gi em score ≥ 9** (`HANDOFF_SCORE_THRESHOLD`).

> Era 7 até 2026-07-24, e isso emudecia a IA no meio da qualificação:
> idioma(2) + disponibilidade(2) + objetivo(2) + conversa passando de 3
> mensagens(1) já dava 7 → handoff → `pausar_ia = 'Sim'` **antes** de o
> agente explicar o método, mandar a tabela e convidar pra experimental,
> que é justamente o objetivo dele. Com 9 o fluxo roda até o fim, e lead
> que topa agendar continua indo pra Gi na hora via `wants_to_schedule`.

O score é calculado sobre o **acumulado da conversa**
(`mergeCollectedData`), não sobre o turno isolado — o modelo omite campos
já coletados em turnos seguintes, e pontuar turno a turno fazia o score
cair e o handoff virar sorteio. `price_asked`, `wants_to_schedule` e
`needs_human` são travas: uma vez `true`, nunca voltam pra `false`.

`wants_to_schedule`, `accepted_consultant`, `needs_human` e `lead_source`
**não entram nessa soma** — os três primeiros são regra própria de handoff
(ver `commercial/handoff-rules.md`), o último é só dado de CRM.
`shouldHandoff(score, collectedData)`: `true` se `score >= 9` **ou**
`wants_to_schedule === true` **ou** `needs_human === true`.

### Tabela de preço tem trava em código (ADR-014)

`canSendPriceTable(modelWantsToSend, data)`: o `send_price_table=true` do
modelo só vale se `price_asked === true` no acumulado da conversa. O modelo
confundia "prefiro aula particular" com pedido de preço em cerca de 1 de cada
3 conversas de teste, mesmo com o algoritmo explícito no `prompt-v1.md` passo
4 — mandar proposta antes de o lead pedir atropela a etapa de conexão.

### Score não pausa mais a IA (ADR-014)

`decideHandoff(score, data, turnFailed)` devolve `{ handoff, pauseAi }`.
Score ≥ 9 gera **alerta** pra Gi, não silêncio. A IA só sai da conversa
(`pauseAi=true`, 1 dia) quando o lead está **qualificado**
(`isQualifiedLead`: idioma + objetivo) **e** aceitou falar com um consultor
(`acceptedConsultant`: `accepted_consultant`, `needs_human` ou
`wants_to_schedule`). Regra definida pelo usuário em 2026-07-25.

## Ordem de coleta observada nos atendimentos reais

Confirma o schema já implementado — seguir essa ordem natural na conversa,
sem parecer questionário:
1. Idioma de interesse (inglês/espanhol) + já conhece o método Callan
2. Experiência prévia (já estudou antes? por que não funcionou?)
3. Objetivo (trabalho, viagem, intercâmbio, desenvolvimento pessoal) e
   urgência (quer começar logo vs. sem pressa)
4. Disponibilidade de horário — perguntada só depois do pitch de
   método/diferenciais, não na abertura
5. Preço — só se o lead perguntar, ou depois que já topou aula experimental

## Por que preço não entra direto no score de qualificação inicial

`price_asked` soma ponto porque perguntar preço é sinal de interesse real,
mas a ordem de apresentação (nunca oferecer preço antes de qualificar) é
regra de conversa, não de scoring — ver `knowledge-base.md`.
