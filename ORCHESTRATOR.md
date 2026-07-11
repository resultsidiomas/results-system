# ORCHESTRATOR.md — Agente Orquestrador
## Results Idiomas × DROP Agency

> Documento de orquestração entre Claude Code e Codex.
> Regras de roteamento, responsabilidades e protocolo de handoff.

---

## Papel do Orquestrador

Este documento define o **orquestrador de agentes** do projeto.
Claude Code atua como orquestrador central: decide, planeja, roteia e acompanha toda execução técnica.

O orquestrador **nunca implementa em paralelo com Codex** sem sincronização prévia.
O orquestrador **nunca assume tarefas do Codex** sem justificativa explícita.
O orquestrador **sempre documenta** antes de delegar ou executar.

---

## Mapa de Responsabilidades

```
┌─────────────────────────────────────────────────────────────┐
│                      CLAUDE CODE                            │
│                    (Orquestrador)                           │
│                                                             │
│  ✅ Arquitetura e decisões técnicas                         │
│  ✅ Backend APIs (Fastify/Node.js)                          │
│  ✅ Banco de dados (Supabase schema + migrations)           │
│  ✅ Agentes de IA (M1 + M2 — system prompts, scoring)      │
│  ✅ Integrações (WhatsApp API, N8n, Meta, Power BI)        │
│  ✅ Fluxos automáticos N8n (M5)                            │
│  ✅ Segurança e autenticação                                │
│  ✅ Infraestrutura e deploy                                 │
│  ✅ Dados dos dashboards M6 (APIs de dados)                │
│  ✅ ADRs e documentação técnica                            │
└─────────────────────────────────────────────────────────────┘
                            │
                      SYNC / CONTRATO
                      (interface clara)
                            │
┌─────────────────────────────────────────────────────────────┐
│                        CODEX                                │
│                    (Implementador UI)                       │
│                                                             │
│  ✅ Interface do CRM (M3 — UI)                             │
│  ✅ Painel Operacional (M4 — layouts e componentes)        │
│  ✅ Dashboards visuais (M6 — gráficos e cards)            │
│  ✅ Componentes React reutilizáveis                        │
│  ✅ Responsividade e CSS                                    │
│  ✅ Animações e microinterações                            │
│  ✅ Correções visuais e ajustes de UX                     │
│  ✅ Organização de componentes                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Árvore de Decisão — Roteamento de Tarefas

Ao receber qualquer solicitação, executar mentalmente este fluxo:

```
Tarefa recebida
      │
      ▼
É arquitetural?
(altera estrutura, banco, segurança, integrações, lógica de agentes)
      │
    SIM ──────────────────────────────────▶ Claude Code assume
      │                                     Planejamento → ADR → Implementação
      │
     NÃO
      │
      ▼
É visual / operacional / repetitiva?
(componente React, layout, CSS, animação, correção simples de UI)
      │
    SIM ──────────────────────────────────▶ Rotear para Codex
      │                                     Gerar prompt otimizado
      │
     NÃO
      │
      ▼
É uma tarefa mista?
(ex: novo módulo que precisa de backend + frontend)
      │
    SIM ──────────────────────────────────▶ Claude Code: backend + contrato de API
      │                                     Codex: frontend consumindo o contrato
      │
     NÃO
      │
      ▼
Claude Code assume com justificativa documentada
```

---

## Protocolo de Handoff para Codex

Quando uma tarefa pertence ao Codex, Claude Code deve:

**1. Anunciar o roteamento:**
```
"Tarefa pertence ao escopo do Codex.
Posso: (1) gerar prompt otimizado para envio ao Codex
       (2) executar aqui mesmo se preferir"
```

**2. Se opção (1), gerar prompt estruturado:**

```markdown
## Prompt para Codex — [nome da tarefa]

**Contexto:** [descrição do módulo e onde essa UI se insere]

**O que construir:** [descrição clara do componente/página]

**API disponível:**
- GET /api/leads — retorna lista de leads com status
- POST /api/leads — cria novo lead
- (ver docs/API.md para contrato completo)

**Design system:** [cores, fontes, padrões da Results Idiomas]
- Primary: #1A2744 (navy)
- Accent: #D8262B (red)
- Font: Inter

**Estrutura de dados esperada:**
```typescript
interface Lead {
  id: string;
  name: string;
  score: number;
  stage: LeadStage;
  // ...
}
```

**Critérios de aceite:**
- [ ] Componente responsivo (mobile + desktop)
- [ ] Estados: loading, empty, error, populated
- [ ] [outros critérios específicos]

**Não fazer:** [o que está fora do escopo dessa tarefa]
```

---

## Módulos e Agente Responsável por Fase

| Módulo | Claude Code | Codex | Sincronização necessária |
|--------|------------|-------|------------------------|
| M1 — Agente Comercial | 100% | — | — |
| M2 — Agente Suporte | 100% | — | — |
| M3 — CRM backend | APIs, banco, WA integration | UI, pipeline visual, cards | Contrato de API antes da UI |
| M4 — Painel Operacional | APIs de alunos/professores | Layouts, formulários, tabelas | Schema do banco antes da UI |
| M5 — Fluxos N8n | 100% (N8n é backend) | — | — |
| M6 — Dashboards | Queries, agregações, API de métricas | Gráficos, cards, visualizações | Estrutura de resposta da API |

---

## Contratos de Interface (API → UI)

Antes de qualquer handoff para Codex, Claude Code define o contrato:

### Formato padrão de contrato

```typescript
// Arquivo: docs/contracts/[modulo]-contract.ts
// Gerado por Claude Code, consumido pelo Codex

// Endpoints disponíveis
GET    /api/v1/leads              → LeadListResponse
POST   /api/v1/leads              → Lead
GET    /api/v1/leads/:id          → Lead
PATCH  /api/v1/leads/:id          → Lead
DELETE /api/v1/leads/:id          → { success: boolean }

// Tipos
interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  score: number;           // 0–10
  stage: LeadStage;
  tags: LeadTag[];
  origin: LeadOrigin;
  createdAt: string;       // ISO 8601
  updatedAt: string;
}

type LeadStage =
  | 'new'
  | 'qualified'
  | 'trial_scheduled'
  | 'proposal'
  | 'enrolled'
  | 'cold'
  | 'nurturing'
  | 'blocked';

type LeadTag =
  | 'business'
  | 'kids'
  | 'conversation'
  | 'career'
  | 'exchange'
  | 'spanish';

type LeadOrigin =
  | 'google_ads'
  | 'referral'
  | 'organic'
  | 'whatsapp_direct';

// Respostas padrão de erro
interface ApiError {
  error: string;
  code: string;
  statusCode: number;
}
```

---

## Protocolo de Sincronização

### Quando Claude Code muda o schema do banco:
1. Atualizar `docs/DATABASE.md`
2. Atualizar contratos de API afetados em `docs/contracts/`
3. **Notificar Codex** antes que ele consuma dados antigos
4. Registrar mudança em `docs/CHANGELOG.md`

### Quando Codex precisa de novo endpoint:
1. Codex reporta necessidade com formato esperado
2. Claude Code avalia viabilidade e retorna contrato
3. Codex implementa consumindo o contrato
4. Sync em `docs/API.md`

### Quando há conflito de responsabilidade:
1. Claude Code decide (é o orquestrador)
2. Justificativa documentada em `docs/DECISIONS.md`
3. Nenhuma implementação acontece até decisão clara

---

## Agentes de IA — Arquitetura de Orquestração Interna

Para os próprios agentes (M1 e M2), o sistema funciona assim:

```
WhatsApp Business API
        │
        ▼
    N8n Webhook
        │
        ▼
   Identificar:
   Lead ou Aluno?
        │
    ┌───┴───┐
    │       │
  Lead    Aluno
    │       │
    ▼       ▼
Agente   Agente
  M1       M2
(Comercial) (Suporte)
    │       │
    └───┬───┘
        │
        ▼
  Supabase DB
  (registrar conversa,
   atualizar score/status)
        │
        ▼
   CRM (M3)
   (atualizar pipeline)
        │
        ▼
  Score ≥ 7?
        │
   SIM     NÃO
    │        │
    ▼        ▼
Notificar  Cadência
   Gi     automática
(handoff)  (3/7/14d)
```

### Lógica de identificação Lead vs Aluno

```typescript
// backend/src/agents/router.ts
async function routeIncomingMessage(phone: string, message: string) {
  const contact = await supabase
    .from('contacts')
    .select('type, id')
    .eq('phone', phone)
    .single();

  if (!contact || contact.type === 'lead') {
    return routeToCommercialAgent(phone, message, contact?.id);
  }

  if (contact.type === 'student') {
    return routeToSupportAgent(phone, message, contact.id);
  }
}
```

---

## Regras de Orquestração — Inegociáveis

1. **Nunca dois agentes no mesmo arquivo ao mesmo tempo** — coordenar antes de editar arquivos compartilhados
2. **Contratos de API são imutáveis durante uma sprint** — mudanças exigem notificação e versionamento
3. **Claude Code é a fonte de verdade técnica** — Codex não toma decisões arquiteturais
4. **Todo handoff tem documentação** — prompt gerado fica em `docs/handoffs/`
5. **Conflito de responsabilidade → parar e documentar** — nunca resolver silenciosamente

---

## Escalação de Problemas

```
Problema técnico simples → Claude Code resolve
Problema de UI/UX → Codex resolve
Problema arquitetural → Claude Code + ADR
Problema de negócio (regra) → escalar para Camila / DROP
Problema de dados da escola → escalar para Gi ou Edu
Conflito de prioridade → escalar para Camila
```

---

## Checklist de Handoff (Claude Code → Codex)

Antes de enviar qualquer tarefa ao Codex, verificar:

- [ ] Contrato de API documentado em `docs/contracts/`
- [ ] Tipos TypeScript definidos e exportados
- [ ] Endpoints testados e funcionando
- [ ] Design system da Results especificado (cores, fontes)
- [ ] Estados de UI especificados (loading, empty, error)
- [ ] Critérios de aceite claros e testáveis
- [ ] O que está fora do escopo explicitado
- [ ] Arquivos que Codex NÃO deve tocar listados

---

## Registro de Handoffs

Todo handoff documentado em `docs/handoffs/YYYY-MM-DD-[descricao].md`:

```markdown
# Handoff: [data] — [descrição]

**De:** Claude Code
**Para:** Codex
**Módulo:** M[n]
**Tarefa:** [descrição]

## Contexto
[por que essa tarefa foi para Codex]

## Entregáveis esperados
[o que Codex deve produzir]

## Contrato de API
[link para docs/contracts/]

## Critérios de aceite
- [ ] ...

## Não fazer
- ...

## Arquivos proibidos
- backend/* (não tocar)
- database/* (não tocar)
```

---

*Última atualização: 2026-06-28 | Versão: 1.0.0*
