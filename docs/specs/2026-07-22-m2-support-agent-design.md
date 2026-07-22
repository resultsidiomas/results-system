# Spec — M2: Agente de IA Suporte + roteamento comercial/suporte

> Status: aprovado (2026-07-22)
> Módulo: M2 (ver ROADMAP.md)
> Relacionado: ADR-007 (arquitetura dos agentes), ADR-009 (vector store RAG), ADR-010 (n8n chama engine completa)

## Contexto

M1 (comercial) está em produção. M2 (suporte) existe só como esqueleto
(`backend/agents/support/.gitkeep`, `backend/src/agents/support/` vazio).
O roteador que decide comercial vs. suporte por interpretação da mensagem
(`backend/src/agents/router/agent.router.ts` + `intent.classifier.ts`) já
existe, testado em isolamento, mas **não está plugado** — o endpoint que o
n8n chama (`n8n-agent.routes.ts`) foi deixado propositalmente sempre
respondendo via `runCommercialTurn`, decisão registrada em ADR-010: "o
roteador entra quando M2 for implementado".

O workflow n8n de produção (`Agente - Entrada via Webhook`, id
`qlkBgS35XBuSysN8`) já está pronto e não muda — ele só faz ack, filtro
`fromMe`, debounce/junção de mensagens e `POST /api/v1/n8n-agent/run`. Toda
decisão de qual agente responde vive no backend.

## Escopo desta fase

Confirmado com o usuário: agente de suporte **conversacional +
escalonamento pra humano**, não automação de agenda real. Várias entregas
do M2 no ROADMAP (reagendamento efetivo, aniversário, pesquisa de
satisfação, avaliação Google) dependem de dados que a Results ainda não
forneceu (agenda real de aulas, datas de matrícula — mesmo bloqueio B1 que
existia pro M1 antes dos docs reais chegarem). Fora de escopo agora.

Dentro de escopo:
- Suporte responde dúvidas via RAG (app Callan, horários, planos,
  materiais, política de reagendamento) usando a base de conhecimento
  (`backend/agents/support/`).
- Qualquer AÇÃO real (remarcar aula, cancelar, reclamação séria, aviso de
  falta de professor) → escalona pra Gi: `pausar_ia='Sim'` + alerta
  WhatsApp, mesmo padrão do handoff comercial (confirmado pelo usuário —
  suporte pausa igual ao comercial, não fica respondendo depois de
  escalar).

## Arquitetura

```
n8n (inalterado):
  webhook → filtro fromMe → filtro allowlist → debounce (Redis)
  → POST /api/v1/n8n-agent/run { message, sessionId, contexto }

backend (/api/v1/n8n-agent/run — MUDA):
  → findOrCreateContact(phone, senderName)
  → guard: pausar_ia === 'Sim' → shouldReactivate(message)?
       não → responde sem reply (comportamento já existente)
       sim → roda o motor certo com notifyHandoff:false, mantém pausado
  → routeAgent(contact, message)          [JÁ EXISTE, passa a ser chamado]
       contact.type === 'student' → 'support'
       senão → classifyIntent(message) → 'support' | 'commercial' | 'ambiguous'→commercial
  → runCommercialTurn(...)  OU  runSupportTurn(...)  [runSupportTurn é NOVO]
  → resposta: { reply, sendPriceTable, priceTableVariant, sessionId, pausarIa }
    (suporte sempre manda sendPriceTable:false, priceTableVariant:null —
    contrato de resposta não muda, n8n não precisa de nenhum ajuste)
```

## Componentes novos

### Conteúdo (`backend/agents/support/`)
Auto-descoberto pelo pipeline de ingestão existente
(`backend/scripts/ingest-knowledge.ts` já varre essa pasta com
`agentType: 'support'` — nenhuma mudança necessária no ingest).

- `prompt-v1.md` — persona Jessica (reusa `agents/shared/persona.md` +
  `forbidden-phrases.md`, ambos já escritos "pra M1 e M2"), define quando
  responder direto (dúvida factual coberta pela KB) vs. quando escalonar
  (qualquer pedido de ação real).
- `rescheduling-rules.md` — regra real e já confirmada no projeto: mínimo
  3h de antecedência pra remarcar (glossário do ROADMAP.md), turma não tem
  reposição de aula perdida (política já documentada em
  `agents/shared/school-info.md`), particular pode remarcar respeitando a
  regra de 3h. Não é placeholder — é fato já conhecido, só nunca tinha sido
  escrito no lugar certo.
- `faq.md`, `knowledge-base.md`, `retention-flow.md` — estrutura com seções
  marcadas ⚠️ pra Results preencher (dúvidas específicas do app Callan,
  script de retenção pra pedido de cancelamento) — mesmo padrão de
  placeholder usado em `agents/commercial/knowledge-base.md` quando faltava
  dado real.

### Código (`backend/src/agents/support/`)
- `support.schema.ts` — schema estruturado da resposta (mesmo padrão
  `response_format: json_schema` do comercial):
  ```ts
  {
    reply: string,
    needs_human: boolean,
    escalation_reason: 'reagendamento' | 'cancelamento' | 'falta_professor'
                      | 'reclamacao' | 'outro' | null,
  }
  ```
- `support.service.ts` — `runSupportTurn(contact, instance, remoteJid, message, options)`:
  espelha `commercial.service.ts` linha a linha (histórico Redis via
  `agent.memory.redis.ts`, RAG via `retrieveKnowledgeContext(message,
  'support')`, persiste turno via `agent.memory.pg.ts` com
  `agent_type: 'support'`, fallback textual em erro). Quando
  `needs_human === true` e `options.notifyHandoff !== false`, chama
  `notifyGi` (ver abaixo) e retorna sinal de handoff pro chamador.

### Ajustes em código existente (generalização mínima pra servir os dois motores)
- **`agent.types.ts`** — adiciona `SupportTurnResult` (aditivo; não altera
  `AgentTurnResult` usado pelo comercial).
- **`commercial.reactivation.ts` → `agents/shared/agent.reactivation.ts`** —
  a lógica (`shouldReactivate`) já é genérica (classifica "dúvida real" vs.
  "encerrado"), só o texto do prompt fala "lead" — ajusta pra "contato".
  Import atualizado em `n8n-agent.routes.ts`.
- **`commercial.handoff.ts` → `agents/shared/agent.handoff.ts`** — extrai
  `notifyGi(contactId, phone, reason, lastReply)`: atualiza `pausar_ia` +
  manda alerta WhatsApp pro `GI_ALERT_NUMBER` (confirmado: mesmo número pro
  comercial e suporte). Comercial passa a chamar essa função genérica com
  `reason: 'lead_quente'`; suporte chama com o `escalation_reason` do turno.
- **`n8n-agent.routes.ts`** — troca a chamada fixa de `runCommercialTurn`
  por `routeAgent(contact, message)` + branch pro motor correto, nos dois
  pontos onde hoje chama `runCommercialTurn` (guard de reativação e fluxo
  normal). Contrato de resposta HTTP não muda.

## Dados

Nenhuma tabela nova. `conversations.agent_type` e `knowledge_chunks.agent_type`
já aceitam `'support'` desde o schema inicial (`database/schema.sql`).

## Erros

Mesmo padrão do comercial: falha do LLM (timeout, erro de API, parse
inválido) cai em resposta de fallback textual fixa, nunca quebra o turno
nem deixa o contato sem resposta. RAG vazio (KB ainda não populada) não
falha o turno — segue sem contexto extra (`retrieveKnowledgeContext` já
trata isso).

## Verificação

Projeto não tem suíte de testes automatizados hoje (nem M1 tem — só
validação manual via console de teste interno,
`backend/src/testing/test-chat.routes.ts`). Segue o mesmo padrão:
- Validar `classifyIntent`/`routeAgent` com mensagens reais de exemplo
  (dúvida de aluno matriculado vs. interesse novo) via console de teste.
- Validar `runSupportTurn` respondendo com RAG da KB de suporte após
  `npm run ingest:knowledge`.
- Validar que `needs_human: true` pausa o contato e dispara alerta (mock ou
  número de teste, mesma allowlist `TEST_ALLOWED_NUMBERS` já usada no M1).

## Fora de escopo (explicitamente adiado)

- Reagendamento efetivo de aula (precisa de tabela de agenda real — não
  existe hoje).
- Mensagens de aniversário automáticas, pesquisa de satisfação trimestral,
  pedido de avaliação Google (dependem de datas de matrícula/agenda — M5/M6).
- Promoção de `contact.type` de `'lead'` pra `'student'` no momento da
  matrícula (hoje nada no código faz essa transição — roteamento pro
  suporte depende inteiramente do `classifyIntent`, o que já cobre o pedido
  original do usuário: "não perguntar, interpretar").
