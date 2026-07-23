# Spec — M1: Correções Fase 2 no Agente Comercial

> Status: aprovado (2026-07-23)
> Módulo: M1 (ver ROADMAP.md)
> Relacionado: ADR-008 (OpenAI gpt-4.1-mini), ADR-012 (ordem texto→imagem na tabela de preço)
> Fonte: `docs.agente/fase 2/` (Atendimento 1-4, Conversa Edu, Auditoria Camila_Agente_Results_Idiomas_Jul2026)

## Contexto

M1 está em produção. A DROP Agency (Camila) rodou uma auditoria formal
(cenário de lead qualificado — pessoa que morou na Austrália, inglês
avançado) e a Results coletou 4 atendimentos reais + 1 conversa de teste do
Edu (dono) em 15–17/07/2026. Os documentos apontam bugs de comportamento
reais em produção, não hipóteses.

Achados consolidados (auditoria + atendimentos reais):

1. **Regra de preço #1 já corrigida no prompt atual** (`send_price_table` +
   `price_table_variant: 'geral'`, tabela única) — a auditoria testou uma
   versão anterior que ainda mandava tabelas sequenciais. Não é mais um
   problema no `prompt-v1.md` atual, confirmado lendo o arquivo. Nenhuma
   ação necessária aqui.
2. **Fato errado sobre a aula experimental**: prompt/knowledge-base atuais
   dizem que a experimental pode ser "turma ou particular". Real: é
   **sempre individual**, ministrada pelo **Prof. Eduardo** (coordenador
   pedagógico), que também faz o teste de nivelamento nela. Confusão real
   causada no Atendimento 3 (lead perguntou 3x se era em turma).
3. **Agendamento com horário inventado**: o agente oferece dia/hora
   específico ("terça às 19h", "sábado às 10h") sem nenhuma integração de
   calendário real. Camila sinalizou isso diretamente na Conversa Edu
   ("precisamos ajustar como faremos para o agente ter acesso a
   disponibilidade real do Edu"). Decisão do usuário: agente para de
   inventar horário fixo — pergunta só turno/dias preferidos e, quando o
   lead topa agendar, dispara handoff imediato pra Gi confirmar o horário
   real.
4. **Momento de fechamento perdido**: no teste da auditoria, o lead disse
   "podemos agendar" e o agente ignorou pra responder o pedido de preço em
   seguida — perdeu a janela de conversão. Padrão se repete nos
   Atendimentos 1/2/3 reais: conversa "morre" sem confirmação, recusa
   explícita ou follow-up agendado.
5. **Validação do frame de comparação com concorrente**: agente não cita o
   nome do concorrente (correto) mas usa frases que confirmam
   implicitamente a comparação ("muita gente fica nessa dúvida",
   "escolas tradicionais") — o treinamento pede pivotar direto pro
   diferencial sem entrar no frame.
6. **Sem personalização pra perfil avançado/retomada** (já morou fora, já
   fala o idioma, nível intermediário+): agente trata como aprendizado do
   zero em vez de manutenção/reativação — perde velocidade de fechamento
   com o lead de maior propensão a converter.
7. **Alucinação observada**: no Atendimento 4 real, o agente afirmou
   "Cada idioma no Método Callan é dividido em 12 módulos" — dado que não
   existe em nenhum arquivo de `agents/`. Viola a regra já existente de
   nunca declarar fato não confirmado, mas aconteceu mesmo assim — precisa
   de reforço explícito específico pra números de módulos/estágios.
8. **Prova social genérica**: depoimentos tipo "muitos alunos" sem dado
   real. Confirmado com o usuário: números reais (retenção, alunos ativos,
   certificação) ainda vão entrar via Supabase/knowledge base — não
   inventar agora, só preparar o prompt pra priorizar dado real do
   CONTEXTO RELEVANTE quando existir.
9. **Origem do lead nunca capturada** — dado necessário pro CRM (Google
   Ads, indicação, Instagram, orgânico), nunca perguntado.
10. **Tempo de resposta alto**: `AGENT_MESSAGE_WAIT_MS=45000` (45s de
    espera antes de responder, pra agrupar burst de mensagens) — auditoria
    pede reduzir pra 15-20s. Decisão do usuário: 18000ms.

Fora de escopo desta fase: integração de calendário real (Edu/Gi) —
tratado como handoff manual, não automação; dados reais de prova social
(entram depois via Supabase, path separado).

## Mudanças de conteúdo (`backend/agents/`)

### `shared/school-info.md`
- Substituir "Modalidade particular ou turma" da aula experimental por:
  sempre individual, ministrada pelo Prof. Eduardo (coordenador
  pedagógico), que faz o teste de nivelamento durante ela. Horário de
  turma só é oferecido depois da experimental (nível já conhecido).
- Adicionar: nº de módulos/estágios do curso não confirmado — não declarar
  quantidade específica a menos que venha no CONTEXTO RELEVANTE.
- Adicionar nota: prova social ainda genérica por falta de dado real
  confirmado; quando CONTEXTO RELEVANTE trouxer estatística real (retenção,
  alunos ativos, certificação), usar o dado real em vez de frase genérica
  ("muitos alunos...").

### `commercial/prompt-v1.md`
- Passo 5 (condução pra experimental) reescrito: nunca oferecer dia/hora
  específico. Perguntar turno/dias preferidos. Quando o lead topa agendar,
  marcar `wants_to_schedule=true`, responder confirmando que vai
  encaminhar pra equipe fechar o horário certinho (sem inventar horário) —
  isso dispara handoff imediato (ver seção Código).
- Nova regra de disciplina de fechamento: sinal de aceitação do lead
  ("podemos agendar", "quero", "sim", equivalentes) deve ser
  confirmado/avançado no mesmo turno, antes de qualquer assunto lateral
  (ex.: pedido de preço que vem junto). Nunca ceder pro assunto lateral
  primeiro.
- Nova regra: toda conversa deve fechar em um dos três estados —
  handoff de agendamento disparado, recusa explícita do lead, ou
  follow-up agendado. Não deixar a conversa "morrer" sem nenhum dos três.
- Nova regra de comparação com concorrente: nunca validar o frame da
  comparação, mesmo veladamente ("muita gente compara",
  "escolas tradicionais") — pivotar direto pro diferencial da Results +
  CTA de experimental.
- Novo branch de personalização: se o lead sinalizar perfil
  avançado/retomada (já morou fora, já fala, nível intermediário+),
  tratar como manutenção/reativação em vez de aprendizado do zero.
- Reforço específico: nunca declarar nº de módulos/estágios sem
  confirmação no contexto.
- `collected_data`: adicionar `wants_to_schedule` (bool, true quando o
  lead topa agendar a experimental) e `lead_source` (string, como o lead
  conheceu a Results — Google, indicação, Instagram, etc., perguntado
  naturalmente no fim da qualificação).

### `commercial/objections.md`
- Nova entrada "Comparação com concorrente" com o script de pivot.
- Objeção "está muito caro" passa a sempre fechar com CTA concreto
  (convite pra experimental) em vez de terminar na resposta informativa.

### `commercial/handoff-rules.md`
- Novo trigger: `wants_to_schedule=true` → handoff imediato pra Gi,
  independente do score (motivo: "Lead quer agendar aula experimental!").
  Justificativa: não existe integração de calendário real, então toda
  intenção de agendamento precisa de confirmação humana de horário.

### `commercial/scoring-rules.md`
- Documentar que `wants_to_schedule` e `lead_source` não entram na conta
  do score (mesmo padrão de `price_asked` vs. regra de conversa) —
  `wants_to_schedule` dispara handoff por regra própria, não por soma de
  pontos.

## Mudanças de código (`backend/src/agents/commercial/`)

- `commercial.schema.ts`: adicionar `wants_to_schedule: z.boolean().nullable()`
  e `lead_source: z.string().nullable()` ao zod schema e ao json schema
  (`required` + `additionalProperties: false` mantidos).
- `commercial.scoring.ts`: `shouldHandoff(score: number, data:
  CommercialCollectedData): boolean` — `true` se `score >= 7` OU
  `data.wants_to_schedule === true`.
- `commercial.service.ts`: usar a nova assinatura de `shouldHandoff`;
  `reason` passado pra `notifyGi` diferenciado: "Lead quer agendar aula
  experimental!" quando o gatilho foi `wants_to_schedule`, "Lead quente!"
  quando foi só score.
- `tests/unit/commercial.scoring.smoke.ts`: atualizar fixtures com os
  novos campos e casos pra nova assinatura de `shouldHandoff`.

## Mudança de config

- `AGENT_MESSAGE_WAIT_MS`: `45000` → `18000` em `.env`, `.env.example` e
  no default do schema (`backend/src/config/env.ts`).

## Fora de escopo

- Integração de calendário real (Google Calendar/agenda do Edu) — decisão
  do usuário foi handoff manual, não automação, nesta fase.
- Números reais de prova social (retenção, alunos ativos, certificação) —
  entram depois via Supabase, path separado, fora desta spec.
- Qualquer mudança de identidade/nome "Jessica" — já decidido
  anteriormente (2026-07-14, ver `shared/persona.md`), não reaberto pela
  auditoria (P8) porque já há decisão confirmada.

## Testes

- Atualizar `commercial.scoring.smoke.ts` (novos campos + nova assinatura
  de `shouldHandoff`, incluindo caso `wants_to_schedule=true` com score
  baixo disparando handoff).
- Validação manual dos prompts: reler os 4 atendimentos reais contra as
  novas regras do `prompt-v1.md` e confirmar que cada bug apontado teria
  sido evitado pela nova versão (checklist, não teste automatizado —
  prompt não é testável em CI).
