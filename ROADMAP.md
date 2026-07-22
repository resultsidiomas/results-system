# ROADMAP.md — Results Idiomas × DROP Agency

> Documento vivo. Atualizar a cada mudança de escopo ou conclusão de fase.
> Fonte de verdade para prioridades e progresso do projeto.

---

## Status Geral

| Item | Valor |
|------|-------|
| Início | 10 jun 2026 |
| Previsão de entrega | 11 jul 2026 |
| Fases | 3 |
| Semanas | 5 |
| Módulos | 6 |
| Status atual | 🔴 Pré-build — checklist pendente |

---

## Visão do Produto

Transformar a operação da Results Idiomas de:

```
ATUAL: Caótica · Manual · Descentralizada · Dependente de pessoa
    Leads → WhatsApp Gi → atendimento manual → planilha → esquecimento

FUTURO: Estruturada · Automatizada · Centralizada · Escalável
    Leads → Agente IA → qualifica → CRM → follow-up automático → matrícula
```

---

## Cronograma Macro

```
SEM 1  (10–14 jun)  ████████  Fase I  — Kick-off, infra, base de conhecimento, critérios M1
SEM 2  (17–21 jun)  ████████  Fase I  — M1 + M2 (agentes), M3 (CRM + WhatsApp API)
SEM 3  (24–28 jun)  ████████  Fase I/II — Testes, M5 (fluxos), M4 (painel operacional)
SEM 4  (1–5 jul)    ████████  Fase II/III — Lead scoring, M6 (dashboards), treinamentos
SEM 5  (8–11 jul)   ████████  Fase III — Power BI, otimização, entrega formal
```

---

## Módulos — Prioridade e Status

### M1 — Agente de IA Comercial `P0 · CRÍTICO`
**Semanas:** 1–2 | **Fase:** I | **Responsável backend:** Claude Code

> **Status Sessão 001 (2026-07-12):** arquitetura base completa (webhook →
> guards → roteador → motor do agente). Pendente: `OPENAI_API_KEY` real pra
> validar respostas de verdade, UAZAPI real conectado. Detalhes completos em
> [`docs/handoffs/2026-07-12-sessao-001.md`](docs/handoffs/2026-07-12-sessao-001.md).
>
> **Update 2026-07-13:** `OPENAI_API_KEY` real configurada. UAZAPI conectada
> (credenciais a caminho). Vector store RAG pronta (ADR-009) — pgvector no
> Supabase + pipeline de ingestão (`npm run ingest:knowledge`).
>
> **Update 2026-07-13 (2):** B2/B3 resolvidos — Results anexou tabelas de
> preço reais + scripts de atendimento + 5 conversas reais de WhatsApp
> (76 imagens). Processado e escrito em `agents/commercial/` (prompt-v1.md,
> knowledge-base.md, objections.md, scoring-rules.md, handoff-rules.md) e
> `agents/shared/` (school-info.md, persona.md, forbidden-phrases.md).
> `commercial.service.ts` agora carrega `prompt-v1.md` real (não mais
> placeholder). Falta só: (1) rodar a migration
> `20260713000001_knowledge_vector_store.sql` no Supabase real, (2) rodar
> `npm run ingest:knowledge` pra popular o vector store, (3) confirmar com a
> Results os valores marcados ⚠️ em `knowledge-base.md` (plano Conversação,
> materiais Business/Kids/Grammar). Doc 3 (B1) ainda pendente — não bloqueia
> mais o core comercial, já que preço/script/tom já vieram por outra via.
>
> **Update 2026-07-14:** persona confirmada pelo usuário — agente se
> apresenta como **"Jessica da equipe Results Idiomas"** (nome próprio pra
> familiaridade, sem reusar o nome da Gislaine/pessoa real). API do console
> de teste do agente pronta (`backend/src/testing/`), frontend roteado pro
> Codex. Detalhes completos e próximos passos em
> [`docs/handoffs/2026-07-14-sessao-002.md`](docs/handoffs/2026-07-14-sessao-002.md).
>
> **Update 2026-07-14 (2):** deploy real na VPS via EasyPanel — backend no
> ar (`/health` 200), UAZAPI real conectada (URL+token reais), webhook
> configurado (token via query string, painel só aceita URL simples).
> Allowlist temporária (`TEST_ALLOWED_NUMBERS`) restringe resposta a 2
> números de teste enquanto valida o conversacional. Preço agora vai por
> **imagem real da tabela** (`backend/assets/price-table/`), nunca mais
> citado em texto — elimina risco de valor errado. Migration do vector
> store aplicada no Supabase real + `npm run ingest:knowledge` rodado (30
> chunks: 19 commercial, 11 shared) — RAG confirmado funcionando
> ponta-a-ponta (retrieval testado contra Supabase real). No caminho,
> achados e corrigidos 3 bugs reais que impediam o servidor de rodar de
> verdade: env vars obrigatórias sem uso real, path de leitura do
> `prompt-v1.md` com profundidade errada, imagem Docker Node 20 abaixo do
> mínimo exigido pelo `@supabase/realtime-js` (`>=22`).

**Entregas:**
- [x] Recepção automática de leads via WhatsApp 24/7 — deploy real na VPS, webhook configurado, allowlist de 2 números pra validação em andamento
- [ ] Triagem e qualificação (curso, horário, frequência, objetivo) — em validação real via WhatsApp (números de teste), ainda sem confirmação de conversa completa ponta-a-ponta
- [x] Lead Scoring automático 0–10 — determinístico, testado (7 casos)
- [x] Handoff para Gi em leads score ≥ 7 — `pausar_ia` testado; alerta WhatsApp pendente `GI_ALERT_NUMBER`
- [ ] Cadência automática de follow-up (3 / 7 / 14 dias) para leads frios — tabela `lead_followups` existe, scheduler não implementado
- [x] Envio automático de apresentação da escola e planos — RAG ativo (migration + ingestão feitas, 30 chunks), preço enviado como foto real da tabela, não mais texto
- [ ] Agendamento de aula experimental via link ou chat — não implementado
- [ ] Relatório diário: leads recebidos, convertidos, pendentes — não implementado

**Arquivos principais:**
```
backend/agents/commercial/prompt-v1.md
backend/agents/commercial/knowledge-base.md
backend/agents/commercial/scoring-rules.md
backend/agents/commercial/objections.md
backend/agents/commercial/handoff-rules.md
backend/src/agents/commercial/
```

**Bloqueadores:**
- ⚠️ Doc 3 (Briefing do Agente) pendente de preenchimento pela Results
- ⚠️ Tabela de preços e cursos pendente

---

### M2 — Agente de IA Suporte `P0 · CRÍTICO`
**Semanas:** 1–2 | **Fase:** I | **Responsável backend:** Claude Code

> **Status (2026-07-22):** motor conversacional completo — `runSupportTurn`
> espelha o motor comercial (RAG, structured output, persistência), ligado
> nos 3 pontos de entrada (`n8n-agent.routes.ts`, `uazapi.webhook.ts`,
> console de teste) via `routeAgent`, que já interpretava a intenção da
> mensagem sem perguntar ao usuário. Escopo aprovado: agente responde
> dúvidas via RAG e escala pra Gi (pausa a IA + alerta WhatsApp) qualquer
> ação real (remarcar, cancelar, falta de professor, reclamação séria) —
> automação real de agenda/calendário fica fora de escopo até a Results
> fornecer os dados (mesmo bloqueio B1 que existia pro M1). Conteúdo da KB
> de suporte (`agents/support/*.md`) tem seções ⚠️ aguardando material real
> da Results (FAQ do app Callan, script de retenção); regra de reagendamento
> (3h de antecedência, sem reposição em turma) já é conteúdo real, não
> placeholder.

**Entregas:**
- [x] Respostas automáticas a dúvidas do app Callan — estrutura pronta,
      conteúdo real pendente da Results (`agents/support/faq.md`)
- [x] Informações sobre horários, planos e materiais — RAG ativo
- [x] Comunicação de falta de professor — reconhece e escala pra Gi
- [x] Fluxo de retenção para alunos que solicitam cancelamento — reconhece,
      pergunta motivo, escala pra Gi; script real pendente da Results
- [ ] Reagendamento efetivo de aulas — regra de 3h documentada e explicada
      pelo agente, mas confirmação real do novo horário é sempre handoff
      (sem agenda real integrada ainda)
- [ ] Mensagens de aniversário personalizadas — fora de escopo (depende de
      data de matrícula real, ver M5/M6)
- [ ] Pesquisa de satisfação trimestral automática — fora de escopo
- [ ] Pedido de avaliação no Google (após 30 dias de matrícula) — fora de
      escopo

**Arquivos principais:**
```
backend/agents/support/prompt-v1.md
backend/agents/support/rescheduling-rules.md
backend/agents/support/faq.md
backend/agents/support/knowledge-base.md
backend/agents/support/retention-flow.md
backend/src/agents/support/
backend/src/agents/shared/agent.handoff.ts
backend/src/agents/shared/agent.reactivation.ts
```

---

### M3 — CRM + Dashboard WhatsApp `P0`
**Semanas:** 1–2 | **Fase:** I | **Responsável:** Claude Code (backend) + Codex (UI)

**Entregas:**
- [ ] Pipeline visual com 8 etapas
- [ ] Tags por perfil (Business/Kids/Conversação/Carreira/Intercâmbio/Espanhol)
- [ ] Integração WhatsApp Business API — conversas centralizadas
- [ ] Histórico completo de cada lead com timeline
- [ ] Rastreamento de origem (Google Ads / Indicação / Orgânico)
- [ ] Conversão offline via palavra-chave
- [ ] Alertas de lead inativo configuráveis
- [ ] Painel de oportunidades por etapa

**Pipeline:**
```
Novo Lead → Qualificado → Aula Exp. → Proposta → Matriculado → Frio → Nutrição → Não receber
```

---

### M4 — Painel Operacional `P1`
**Semana:** 3 | **Fase:** II | **Responsável:** Codex (UI) + Claude Code (APIs)

**Entregas:**
- [ ] Cadastro completo: curso, plano, professor, horário, estágio
- [ ] Controle de presença e faltas por turma e aluno
- [ ] Gestão de turmas: capacidade, vagas, horários
- [ ] Controle de professores: agenda, disponibilidade, substituições
- [ ] Checklist de onboarding automatizado de novo aluno
- [ ] Alertas de renovação de contrato
- [ ] Histórico de ocorrências com registro de solução
- [ ] Manual do Aluno digital integrado

---

### M5 — 7 Fluxos Automáticos N8n `P1`
**Semana:** 3 | **Fase:** II | **Responsável:** Claude Code

**Entregas:**
- [ ] **Fluxo 1** — Onboarding: boas-vindas + acesso app + 1º horário
- [ ] **Fluxo 2** — Cobrança: lembrete 3 dias antes + vencimento + 2 dias após
- [ ] **Fluxo 3** — Indicação: disparo após 30 dias de matrícula
- [ ] **Fluxo 4** — Reativação leads frios: 3 mensagens / 21 dias
- [ ] **Fluxo 5** — Campanhas sazonais (1/mês via disparo em massa)
- [ ] **Fluxo 6** — Aniversário na escola (1 mês, 6 meses, 1 ano)
- [ ] **Fluxo 7** — Pesquisa pós-aula experimental (2h após)

**Arquivos:**
```
flows/flow-01-onboarding.json
flows/flow-02-cobranca.json
...
backend/src/flows/
```

---

### M6 — Dashboards Financeiro + Funil `P2`
**Semanas:** 4–5 | **Fase:** III | **Responsável:** Claude Code (dados) + Codex (UI)

**Entregas:**
- [ ] Dashboard Financeiro: MRR, inadimplência, ticket médio, projeção LTV
- [ ] Controle de cobranças por plano e aluno
- [ ] Dashboard Funil: conversão por etapa, custo por lead, origem
- [ ] Taxa de churn mensal com análise de motivo
- [ ] Capacidade vs. ocupação por turma e horário
- [ ] Integração Power BI (Vitor)
- [ ] Relatório executivo PDF semanal automático

---

## Fases

### FASE I — Diagnóstico e Estruturação (Sem 1–3)

**Responsabilidade DROP:**
- [ ] Kick-off e mapeamento de fluxos comerciais/operacionais
- [ ] Levantamento e organização de materiais existentes
- [ ] Definição de critérios de qualificação do Agente Comercial
- [ ] Configuração CRM e pipeline de vendas (M3)
- [ ] Setup e integração WhatsApp Business API (M3)
- [ ] Treinamento e configuração dos Agentes de IA (M1 + M2)
- [ ] Ativação gradual dos agentes
- [ ] Ajustes finos pós-testes

**Responsabilidade RESULTS:**
- [ ] Fornecer materiais para treinamento dos agentes
- [ ] Fornecer acessos e credenciais
- [ ] Pagamento do setup
- [ ] Designar ponto focal e estrutura de aprovação
- [ ] Organizar e exportar base de dados de alunos
- [ ] Contratar WhatsApp Business API (oficial Meta)
- [ ] Testes com Gi e Edu
- [ ] **Aceite formal da Fase I** (5 dias úteis após entrega)

---

### FASE II — Implementação e Automação (Sem 3–4)

**DROP:** M5 (7 fluxos), M4 (painel), lead scoring, tutoriais gravados, treinamentos
**RESULTS:** assistir tutoriais, operar painel, participar de treinamentos, **aceite formal Fase II**

---

### FASE III — Otimização e Dashboards (Sem 4–5)

**DROP:** M6 (dashboards), integração Power BI, otimização com dados reais, entrega formal, documentação técnica
**RESULTS:** fornecer acesso Power BI, validar dashboards, **aceite formal Fase III + início mensalidade**

---

## Infraestrutura Necessária

### Stack Técnica — CONFIRMADA ✅

| Componente | Tecnologia | ADR | Responsável | Status |
|-----------|-----------|-----|-------------|--------|
| Backend | Node.js + TypeScript + Fastify | ADR-001 ✅ | DROP | ⏳ A implementar |
| Banco | Supabase (PostgreSQL) + JS Client + Zod | ADR-002 ✅ | DROP | ⏳ A configurar |
| Deploy/VPS | EasyPanel na VPS | ADR-003 ✅ | DROP | ⏳ A contratar |
| IA dos agentes | OpenAI (`gpt-4.1-mini`) — ADR-008 | ADR-008 ✅ | DROP | ✅ Licença ok |
| Mensageria | WhatsApp Business API (Meta oficial) | — | RESULTS | ⏳ Pendente |
| Frontend | React + TypeScript | — | Codex | ⏳ A implementar |
| Automações simples | N8n (auxiliar, não crítico) | — | DROP | ⏳ Opcional |
| Versionamento | GitHub | — | DROP | ⏳ Pendente |
| E-mail operacional | Gmail | — | DROP | ⏳ Pendente |
| Meta Business Manager | BM verificada com CNPJ | — | RESULTS | ⏳ Pendente |

> ⚠️ **N8n é auxiliar** — flows simples periféricos (lembretes de cobrança, campanhas).
> **Nunca** na lógica principal dos agentes. Agentes vivem 100% no backend Node.js.

---

## Bloqueadores Críticos

| # | Bloqueador | Responsável | Impacto |
|---|-----------|------------|---------|
| B1 | Doc 3 (Briefing do Agente) sem preenchimento | RESULTS | Bloqueia M1 e M2 totalmente |
| B2 | ✅ Resolvido 2026-07-13 — tabela de preços entregue (`docs.agente/Tabelas de Preços/`), processada em `agents/commercial/knowledge-base.md` | RESULTS | — |
| B3 | ✅ Resolvido 2026-07-13 — scripts + atendimentos reais entregues (`docs.agente/`), processados em `agents/commercial/prompt-v1.md`, `objections.md`, `agents/shared/persona.md` | RESULTS | — |
| B4 | WhatsApp Business API não contratada | RESULTS | Bloqueia integração de todos os agentes |
| B5 | VPS + EasyPanel não contratada | DROP | Bloqueia toda a infraestrutura |
| B6 | Supabase não configurado | DROP | Bloqueia banco de dados |

---

## Decisões Registradas

| ADR | Decisão | Status |
|-----|---------|--------|
| ADR-001 | Node.js + TypeScript + Fastify como backend | ✅ Aceito |
| ADR-002 | Supabase JS Client + Zod (sem ORM extra) | ✅ Aceito |
| ADR-003 | EasyPanel na VPS para deploy | ✅ Aceito |
| ADR-005 | Modelo Claude para os agentes | Superseded por ADR-008 |
| ADR-006 | Estratégia de memória dos agentes (Redis+PostgreSQL) | ✅ Aceito |
| ADR-007 | Arquitetura completa dos agentes | ✅ Aceito |
| ADR-008 | Modelo OpenAI gpt-4.1-mini (agentes + roteador) | ✅ Aceito |

---

## Glossário do Projeto

| Termo | Significado |
|-------|------------|
| Gi / Gislaine | Ponto focal operacional da Results — atendimento e CRM |
| Edu / Eduardo | Responsável por aprovações formais e visão executiva |
| Vitor | Dados, Power BI, integração BI |
| Camila | Gestora do projeto na DROP Agency |
| Score ≥ 7 | Lead quente → handoff imediato para Gi |
| Regra 3h | Reagendamento exige mínimo 3h de antecedência |
| Aula experimental | Demo gratuita antes da matrícula |
| BSP | Business Solution Provider — intermediário para WhatsApp API |
| MRR | Monthly Recurring Revenue |
| LTV | Lifetime Value |
| Churn | Cancelamento de aluno |

---

*Última atualização: 2026-06-28 | Versão: 1.0.0*
*Próxima revisão: Após confirmação das decisões técnicas pendentes*
