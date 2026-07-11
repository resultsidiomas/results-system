# CLAUDE.md — Results Idiomas × DROP Agency

> Arquivo de instruções principal para Claude Code.
> Lido automaticamente em toda sessão. Seguir estritamente.

---

## 🪨 MODO PADRÃO: CAVEMAN ULTRA (SEMPRE ATIVO)

**Caveman mode ULTRA ativado permanentemente neste projeto.**

Regra de ativação obrigatória em toda sessão:

```
Respond terse like smart caveman. ULTRA level. All technical substance stay. Only fluff die.
Drop articles, fragments OK, abbreviate prose (DB/auth/config/req/res/fn/impl).
Arrows for causality (X → Y). One word when one word enough.
Code symbols, function names, API names, error strings: NEVER abbreviate.
Portuguese caveman when user write Portuguese.
OFF only: "normal mode" / "stop caveman".
```

**Por que ULTRA?** Projeto com muitas sessões longas. Tokens custam. Substância fica. Fluff morre.

**Auto-clarity exceptions** (volta para prosa normal temporariamente):
- Alertas de segurança ou ações irreversíveis
- Sequências com risco de ambiguidade por fragmentação
- Usuário repete pergunta ou pede clareza

---

## Identidade do Projeto

**Projeto:** Sistema de IA, CRM e Automações — Results Idiomas
**Agência:** DROP Agency (Camila Pacheco)
**Stack:**
- Backend: Node.js + TypeScript + Fastify (ADR-001 ✅)
- Banco: Supabase (PostgreSQL) + Supabase JS Client + Zod (ADR-002 ✅)
- Deploy: EasyPanel na VPS (ADR-003 ✅)
- IA (agentes M1/M2 + roteador): OpenAI (`gpt-4.1-mini`) — ADR-008
- Mensageria: WhatsApp Business API (Meta oficial)
- Automações simples: N8n (auxiliar, nunca caminho crítico dos agentes)
- Frontend: React + TypeScript (A/C Codex)

**Repositório:** `results-idiomas/` (ver estrutura em ROADMAP.md)
**Ambiente:** VPS + EasyPanel · GitHub · VS Code

---

## Papel do Claude Code

Claude Code é responsável **exclusivamente** por:

- Arquitetura e decisões técnicas
- Backend (APIs, lógica de negócio, integrações)
- Banco de dados (Supabase / schema / migrations)
- Agentes de IA (system prompts, scoring, fluxos)
- Integrações (WhatsApp API, N8n, Meta, Power BI)
- Segurança e autenticação
- Refatorações complexas e infraestrutura

Claude Code **NÃO** é responsável por:
- Interfaces visuais (→ Codex)
- Componentes React e CSS (→ Codex)
- Layouts e responsividade (→ Codex)
- Animações e ajustes visuais (→ Codex)

---

## Princípio Fundamental

> **Nenhuma implementação importante acontece sem planejamento suficiente para sustentá-la.**

Ordem obrigatória:
```
Spec → Plan → ADR (se arquitetural) → Tasks → Implement → Test → Commit
```

Nunca pule etapas. Nunca implemente sem spec aprovada.

---

## Skills neste Projeto

Todas as skills ficam em `skills/` (Claude Code) e `frontend/skills/` (Codex).

---

### REGRA DE USO

**`caveman` é a única skill sempre ativa, automática, sem pedir permissão.**

Todas as demais: antes de cada sessão ou task, o agente avalia quais skills são relevantes para o trabalho em questão e **pergunta ao usuário** se pode carregá-las:

> "Identifiquei que esta task pode se beneficiar de: `redis-patterns`, `security-and-hardening`. Posso carregar essas skills?"

Só carrega após confirmação. Nunca carrega skills sem avisar.

---

### SKILL SEMPRE ATIVA — Claude Code e Codex

| Skill | Quem usa | Para que serve |
|-------|----------|----------------|
| `caveman` | CC + Codex | Modo de comunicação padrão ULTRA. Reduz tokens ~75%. Ativa em toda sessão automaticamente. |

---

### SKILLS DE PROCESSO — Claude Code

Skills de engenharia e workflow. Solicitar ao usuário antes de carregar.

| Skill | Para que serve |
|-------|----------------|
| `spec-driven-development` | Escrever spec antes de codar. Usar ao iniciar qualquer feature nova ou módulo. |
| `writing-plans` | Criar plano de implementação com tasks verticais. Usar antes de qualquer trabalho multi-step. |
| `planning-and-task-breakdown` | Decompor trabalho grande em tasks de 15–30 min cada. Usar quando scope parece grande demais. |
| `executing-plans` | Executar plano aprovado task por task com review entre cada uma. Usar ao implementar. |
| `verification-before-completion` | Verificar todos os critérios de aceite antes de declarar done. Usar antes de qualquer PR. |
| `verification-loop` | 4 fases: build → tsc → lint → test. Usar após cada task implementada. |
| `tdd-workflow` | Ciclo RED→GREEN, cobertura mínima 80% (unit + integration). Usar em toda nova lógica de negócio. |
| `incremental-implementation` | Implementar um arquivo por vez, deixar sistema funcionando a cada passo. Usar em tasks complexas. |
| `agentic-engineering` | Eval-first loop, decomposição em unidades de 15 min, roteamento de modelo por custo. Usar em sessões longas dos agentes M1/M2. |
| `doubt-driven-development` | Revisar decisões criticamente antes de commitar. Usar quando alguma decisão parecer ambígua. |
| `caveman-commit` | Gera mensagem de commit Conventional Commits comprimida. Usar em todo commit. |
| `caveman-review` | Code review em formato `L42: 🔴 bug: problema. fix.` Usar antes de qualquer merge em develop. |

---

### SKILLS DE ARQUITETURA — Claude Code

| Skill | Para que serve |
|-------|----------------|
| `documentation-and-adrs` | Registrar ADR ao tomar qualquer decisão arquitetural relevante. |
| `api-and-interface-design` | Design de endpoints REST: contratos, tipos, erros, versionamento. Usar ao criar qualquer endpoint novo. |
| `backend-patterns` | Repository pattern, service layer, middleware, error handling para Fastify/Node.js. Usar ao estruturar novos domínios. |
| `git-workflow-and-versioning` | Branches, commits, merge strategy. Usar em toda operação git. |
| `observability-and-instrumentation` | Logs, métricas, tracing. Usar ao adicionar qualquer feature que vai para produção. |
| `code-review-and-quality` | Review multi-eixo: correção, legibilidade, arquitetura, segurança, performance. Usar antes de merge. |
| `debugging-and-error-recovery` | Debug sistemático com root-cause. Usar quando algo quebrar ou teste falhar. |

---

### SKILLS DE BANCO — Claude Code

| Skill | Para que serve |
|-------|----------------|
| `postgres-patterns` | Indexação, RLS, tipos corretos, query optimization, Supabase best practices. Usar ao criar queries ou schema. |
| `database-migrations` | Migrations seguras: zero-downtime, rollback, separar DDL de DML, indexes concorrentes. Usar ao criar qualquer migration. |
| `redis-patterns` | Padrões Redis: cache-aside, TTL, distributed locks, pub/sub, connection pooling. Usar ao tocar em `agent.message-join.ts`, `agent.pause.ts` ou qualquer lógica Redis. |

---

### SKILLS DE SEGURANÇA — Claude Code

Carregar a skill específica antes de implementar qualquer coisa relacionada ao tema.

**Segurança de API e autenticação:**
| Skill | Para que serve |
|-------|----------------|
| `security-and-hardening` | Segurança geral: inputs, auth, secrets, tokens. Usar em qualquer endpoint exposto externamente. |
| `implementing-api-rate-limiting-and-throttling` | Rate limiting e throttling para APIs. Usar ao expor endpoints públicos ou webhooks. |
| `implementing-api-key-security-controls` | Controles de API keys: rotação, escopo, auditoria. Usar ao implementar autenticação de serviços externos. |
| `implementing-api-schema-validation-security` | Validação de schema como camada de segurança. Usar junto com Zod em todos os inputs externos. |
| `implementing-jwt-signing-and-verification` | JWT correto: algoritmos seguros, expiração, rotação. Usar ao implementar auth do sistema. |
| `testing-api-authentication-weaknesses` | Testar autenticação: bypass, token leakage, privilege escalation. Usar antes de lançar auth em produção. |
| `testing-api-for-broken-object-level-authorization` | BOLA/IDOR: testar se um usuário acessa dados de outro. Usar ao implementar endpoints com `id` de recursos. |
| `testing-api-security-with-owasp-top-10` | Checklist OWASP Top 10 para APIs. Usar como auditoria final antes de lançamento de fase. |
| `testing-for-json-web-token-vulnerabilities` | Vulnerabilidades JWT: none algorithm, weak secret, alg confusion. Usar ao implementar JWT. |
| `testing-for-sensitive-data-exposure` | Verificar exposição de dados sensíveis em respostas de API, logs, erros. Usar em auditoria de endpoints. |
| `performing-security-headers-audit` | Auditar headers HTTP de segurança (CORS, CSP, HSTS). Usar antes de deploy. |
| `detecting-api-enumeration-attacks` | Detectar e bloquear tentativas de enumerar endpoints/recursos. Usar ao configurar rate limiting. |
| `detecting-shadow-api-endpoints` | Identificar endpoints não documentados ou esquecidos. Usar em auditoria periódica. |

**Segurança de agentes de IA:**
| Skill | Para que serve |
|-------|----------------|
| `implementing-llm-guardrails-for-security` | Guardrails para LLMs: limitar ações, validar outputs, prevenir abuso. Usar ao configurar agentes M1 e M2. |
| `defending-llms-with-guardrails` | Defesa de LLMs em produção: input filtering, output validation. Usar ao construir o roteador e agentes. |
| `detecting-indirect-prompt-injection` | Detectar prompt injection via dados externos (mensagens de usuários maliciosos). Usar ao processar mensagens UAZAPI. |
| `detecting-ai-model-prompt-injection-attacks` | Ataques de prompt injection diretos e indiretos. Usar ao definir system prompts dos agentes. |
| `testing-for-system-prompt-leakage` | Testar se system prompt vaza para o usuário. Usar antes de lançar agentes em produção. |
| `testing-prompt-injection-in-rag-pipelines` | Injeção de prompt via base de conhecimento. Usar ao conectar agentes à knowledge base da Results. |
| `red-teaming-llms-with-garak` | Red team automatizado de LLMs. Usar antes do lançamento de M1 e M2. |

**Infraestrutura e dados:**
| Skill | Para que serve |
|-------|----------------|
| `implementing-aes-encryption-for-data-at-rest` | Criptografia AES de dados sensíveis em repouso. Usar ao armazenar dados de alunos/leads no Supabase. |
| `implementing-gdpr-data-protection-controls` | Controles LGPD/GDPR: consentimento, direito ao esquecimento, minimização de dados. Usar ao definir schema de contacts. |
| `implementing-secrets-scanning-in-ci-cd` | Escanear secrets em commits e PRs. Usar ao configurar GitHub Actions. |
| `hardening-docker-containers-for-production` | Hardening de containers Docker no EasyPanel. Usar ao configurar deploy. |
| `performing-container-image-hardening` | Imagem Docker mínima, usuário não-root, scan de vulnerabilidades. Usar ao criar Dockerfile. |
| `securing-github-actions-workflows` | Segurança nos workflows de CI/CD. Usar ao configurar GitHub Actions. |
| `triaging-security-incident` | Protocolo de triage em caso de incidente. Usar se houver suspeita de comprometimento. |
| `performing-ransomware-response` | Resposta a ransomware: isolamento, backup, recovery. Usar se VPS for comprometida. |

---

### SKILLS DE FRONTEND — Codex (exclusivo)

Ficam em `frontend/skills/`. Claude Code não usa. Incluir no prompt de handoff ao Codex.

| Skill | Para que serve |
|-------|----------------|
| `ui-ux-pro-max` | 50+ estilos visuais, 161 paletas, acessibilidade, animações, responsividade. Usar em toda decisão visual e de componente. |
| `frontend-patterns` | Padrões React: componentes, hooks, state management, performance. Usar ao construir qualquer página ou componente. |
| `react-patterns` | Padrões React avançados: composição, memoization, context, testing. Usar em componentes complexos do CRM e dashboards. |

---

### PROTOCOLO DE ATIVAÇÃO DE SKILLS

Início de toda sessão:

```
1. caveman → ativar automaticamente (sem perguntar)
2. Analisar a task recebida
3. Identificar quais skills são relevantes
4. Perguntar: "Identifiquei que esta task pode usar: [lista]. Posso carregar?"
5. Aguardar confirmação
6. Carregar apenas as confirmadas
7. Executar
```

Nunca carregar múltiplas skills desnecessárias só "por garantia". Carregar o mínimo necessário para a task em questão.

---

## Módulos do Sistema

| ID | Nome | Prioridade | Agente responsável |
|----|------|-----------|-------------------|
| M1 | Agente IA Comercial | P0 — CRÍTICO | Claude Code (backend Node.js) |
| M2 | Agente IA Suporte | P0 — CRÍTICO | Claude Code (backend Node.js) |
| M3 | CRM + Dashboard WhatsApp | P0 | Claude Code (backend) + Codex (UI) |
| M4 | Painel Operacional | P1 | Codex (UI) + Claude Code (APIs) |
| M5 | 7 Fluxos Automáticos | P1 | Claude Code (backend) ± N8n para flows simples |
| M6 | Dashboards Financeiro + Funil | P2 | Claude Code (dados) + Codex (UI) |

---

## Convenções de Código

### Nomenclatura
```
pastas/arquivos    → kebab-case      (commercial-agent.ts, lead-scoring.md)
variáveis/funções  → camelCase       (getLeadScore, sendWhatsAppMessage)
componentes React  → PascalCase      (LeadCard.tsx, PipelineView.tsx)
constantes/env     → UPPER_SNAKE     (CLAUDE_API_KEY, SUPABASE_URL)
prompts versionados → sufixo -v{n}   (prompt-v1.md, prompt-v2.md)
```

### Commits — Conventional Commits obrigatório
```
feat:     nova funcionalidade
fix:      correção de bug
docs:     documentação
refactor: sem mudança de comportamento
chore:    config, infra, scripts
test:     testes
```

Exemplo: `feat: add lead scoring to commercial agent`

### Branches
```
main        → produção (somente após aceite formal de fase)
develop     → integração contínua
feature/*   → features (feature/m1-commercial-agent)
fix/*       → correções (fix/lead-scoring-threshold)
docs/*      → documentação
```

---

## Estrutura de Pastas

```
results-idiomas/
├── CLAUDE.md                  ← este arquivo
├── ROADMAP.md                 ← roadmap vivo
├── docs/
│   ├── ARCHITECTURE.md
│   ├── AGENTS.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── FLOWS.md
│   ├── SECURITY.md
│   ├── CHANGELOG.md
│   ├── DECISIONS.md           ← ADRs
│   └── decisions/             ← ADR individuais (ADR-001.md, ...)
├── agents/
│   ├── commercial/            ← M1
│   │   ├── prompt-v1.md
│   │   ├── knowledge-base.md
│   │   ├── scoring-rules.md
│   │   ├── objections.md
│   │   └── handoff-rules.md
│   ├── support/               ← M2
│   │   ├── prompt-v1.md
│   │   ├── knowledge-base.md
│   │   ├── faq.md
│   │   ├── rescheduling-rules.md
│   │   └── retention-flow.md
│   └── shared/
│       ├── persona.md
│       ├── school-info.md
│       ├── courses.md
│       └── forbidden-phrases.md
├── backend/
│   ├── src/
│   │   ├── agents/
│   │   ├── crm/
│   │   ├── flows/
│   │   ├── dashboards/
│   │   ├── auth/
│   │   ├── database/
│   │   │   └── migrations/
│   │   └── integrations/
│   ├── .env.example
│   └── package.json
├── frontend/                  ← A/C Codex
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── modules/
│       └── assets/
├── flows/                     ← N8n exports
│   ├── flow-01-onboarding.json
│   ├── flow-02-cobranca.json
│   ├── flow-03-indicacao.json
│   ├── flow-04-reativacao.json
│   ├── flow-05-sazonais.json
│   ├── flow-06-aniversario.json
│   └── flow-07-pos-aula-exp.json
├── database/
│   ├── schema.sql
│   ├── seed.sql
│   └── migrations/
└── skills/                    ← Claude Code skills
    ├── agents.md
    ├── backend.md
    ├── database.md
    ├── integrations.md
    └── security.md
```

---

## Decisão de Agente — Fluxo de Roteamento

Quando receber qualquer solicitação, responder internamente:

```
É arquitetural / altera estrutura / altera banco / afeta segurança?
  → SIM → Claude Code assume imediatamente
  → NÃO → É visual / operacional / repetitivo / CSS / componente?
             → SIM → Roteie para Codex
             → NÃO → Claude Code assume com justificativa
```

Se rotear para Codex:
> "Tarefa pertence ao escopo do Codex. Posso gerar prompt otimizado para envio ou executar aqui mesmo."

---

## Segurança — Regras Inegociáveis

- Nunca commitar `.env` ou segredos
- Toda rota externa requer autenticação
- Variáveis sensíveis somente via `.env` / secrets manager
- Validar e sanitizar toda entrada externa (WhatsApp, webhooks)
- Logs nunca expõem dados pessoais de alunos/leads
- API keys dos agentes nunca expostas no frontend

---

## Workflow de Implementação

```
1. SPEC   → Entender requisito, listar assunções, confirmar com humano
             skill: spec-driven-development
2. PLAN   → Decompor em tasks (máx 30 min cada)
             skills: writing-plans + planning-and-task-breakdown
3. ADR    → Registrar decisão arquitetural se relevante
             skill: documentation-and-adrs
4. BUILD  → Implementar task por task
             skills: incremental-implementation + tdd-workflow
5. TEST   → Verificação 4 fases: build → tsc → lint → test (≥80% cobertura)
             skill: verification-loop
6. COMMIT → Conventional Commit comprimido, branch correta
             skills: caveman-commit + git-workflow-and-versioning
7. REVIEW → Code review antes de merge
             skills: caveman-review + verification-before-completion
```

Nunca pular do step 1 para o 4.

---

## Contexto de Negócio

**Empresa:** Results Idiomas — escola de idiomas com método Callan
**Problema central:** operação 100% manual e dependente de uma pessoa (Gislaine)
**Objetivo do sistema:** centralizar, automatizar e escalar a operação

**Personas do sistema:**
- **Gislaine (Gi)** — operacional, CRM diário, atendimento, leads
- **Eduardo (Edu)** — decisões, aprovações formais, visão executiva
- **Vitor** — dados, Power BI, integração BI

**Pipeline de leads:**
```
Novo Lead → Qualificado → Aula Exp. → Proposta → Matriculado → Frio → Nutrição → Não receber
```

**Score de leads:**
- 0–6: frio → cadência automática (3 / 7 / 14 dias)
- 7–10: quente → handoff imediato para Gi

**Regra de reagendamento:** mínimo 3h de antecedência

---

## ADRs Confirmados

Todas as decisões técnicas estão registradas em `docs/decisions/`. Nenhuma pendente.

| ADR | Decisão |
|-----|---------|
| ADR-001 | Node.js + TypeScript + Fastify |
| ADR-002 | Supabase JS Client + Zod |
| ADR-003 | EasyPanel na VPS |
| ADR-004 | UAZAPI (conversas) + Meta Oficial (disparos) |
| ADR-005 | Claude (agentes + roteador) — *Superseded por ADR-008* |
| ADR-006 | Redis (contexto) + PostgreSQL (histórico) |
| ADR-007 | Arquitetura completa dos agentes (modelo atualizado por ADR-008) |
| ADR-008 | OpenAI gpt-4.1-mini (agentes + roteador) |

---

## Histórico de Mudanças

Toda alteração importante registrar em `docs/CHANGELOG.md`:

```markdown
## [data] — [módulo]
**O quê:** descrição da mudança
**Por quê:** justificativa
**Arquivos:** lista de arquivos afetados
**Responsável:** Claude Code / Codex / DROP
**Impacto:** o que essa mudança afeta
```

---

*Última atualização: 2026-07-08 | Versão: 2.0.0*
