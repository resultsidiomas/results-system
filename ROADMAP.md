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

**Entregas:**
- [ ] Recepção automática de leads via WhatsApp 24/7
- [ ] Triagem e qualificação (curso, horário, frequência, objetivo)
- [ ] Lead Scoring automático 0–10
- [ ] Handoff para Gi em leads score ≥ 7
- [ ] Cadência automática de follow-up (3 / 7 / 14 dias) para leads frios
- [ ] Envio automático de apresentação da escola e planos
- [ ] Agendamento de aula experimental via link ou chat
- [ ] Relatório diário: leads recebidos, convertidos, pendentes

**Arquivos principais:**
```
agents/commercial/prompt-v1.md
agents/commercial/knowledge-base.md
agents/commercial/scoring-rules.md
agents/commercial/objections.md
agents/commercial/handoff-rules.md
backend/src/agents/commercial/
```

**Bloqueadores:**
- ⚠️ Doc 3 (Briefing do Agente) pendente de preenchimento pela Results
- ⚠️ Tabela de preços e cursos pendente

---

### M2 — Agente de IA Suporte `P0 · CRÍTICO`
**Semanas:** 1–2 | **Fase:** I | **Responsável backend:** Claude Code

**Entregas:**
- [ ] Reagendamento de aulas (regra: +3h de antecedência)
- [ ] Respostas automáticas a dúvidas do app Callan
- [ ] Comunicação de falta de professor e reagendamento
- [ ] Informações sobre horários, planos e materiais
- [ ] Mensagens de aniversário personalizadas
- [ ] Pesquisa de satisfação trimestral automática
- [ ] Pedido de avaliação no Google (após 30 dias de matrícula)
- [ ] Fluxo de retenção para alunos que solicitam cancelamento

**Nota:** Ativar M2 antes de M1 (menor risco operacional).

**Arquivos principais:**
```
agents/support/prompt-v1.md
agents/support/knowledge-base.md
agents/support/faq.md
agents/support/rescheduling-rules.md
agents/support/retention-flow.md
backend/src/agents/support/
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
| IA dos agentes | Claude API (`claude-sonnet-4-6`) | — | DROP | ✅ Licença ok |
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
| B2 | Tabela de preços e cursos não entregue | RESULTS | Bloqueia knowledge base dos agentes |
| B3 | Scripts de atendimento da Gi não enviados | RESULTS | Bloqueia treinamento do agente comercial |
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
| ADR-004 | Modelo Claude para os agentes | ⏳ Pendente definição |
| ADR-005 | Estratégia de memória dos agentes | ⏳ Pendente definição |

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
