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

Score máximo: 10. **Handoff pra Gi em score ≥ 7.**

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
