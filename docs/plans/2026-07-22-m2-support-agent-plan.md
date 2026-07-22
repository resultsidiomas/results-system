# M2 — Agente de Suporte + Roteamento Comercial/Suporte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o agente de suporte (M2) e ligar o roteador comercial/suporte já existente (mas desconectado) nos três pontos de entrada do backend, mantendo o mesmo padrão arquitetural já validado em produção pelo M1.

**Architecture:** `runSupportTurn` espelha `runCommercialTurn` (histórico Redis + RAG pgvector filtrado por `agent_type='support'` + persistência Supabase + structured output OpenAI). `routeAgent` (já existe) decide comercial vs. suporte por interpretação da mensagem (`intent.classifier.ts`, sem perguntar ao usuário) e passa a ser chamado nos 3 pontos que hoje sempre forçam `runCommercialTurn`: `n8n-agent.routes.ts` (caminho real de produção), `uazapi.webhook.ts` (caminho legado, sem tráfego real hoje mas com o TODO já marcado no código) e `test-chat.routes.ts` (console de teste interno). Handoff pra humano (`notifyGi`) e reativação pós-pausa (`shouldReactivate`) são generalizados de `agents/commercial/*` pra `agents/shared/*` porque os dois motores precisam da mesma lógica.

**Tech Stack:** Node.js + TypeScript + Fastify, Supabase (Postgres + pgvector), Redis, OpenAI (`gpt-4.1-mini` chat + `text-embedding-3-small` embeddings), Zod, UAZAPI (WhatsApp).

## Global Constraints

- Nunca declarar preço, prazo, condição ou fato sobre a escola fora do CONTEXTO RELEVANTE/arquivos de `agents/` (`agents/shared/forbidden-phrases.md`).
- Nunca afirmar ser humana se perguntada diretamente (`agents/shared/persona.md`).
- Toda ação real (remarcar aula, cancelar, reclamação séria, falta de professor) é sempre handoff pra Gi — o agente nunca confirma essas ações sozinho (spec, escopo aprovado).
- Escalonamento pausa a IA no contato (`pausar_ia='Sim'`) e usa o mesmo `GI_ALERT_NUMBER` do comercial (confirmado com o usuário).
- Sem tabela nova no banco — `conversations.agent_type` e `knowledge_chunks.agent_type` já aceitam `'support'`.
- Sem framework de teste novo — projeto usa scripts `.smoke.ts` simples (console.log PASS/FAIL), executados com `npx tsx --env-file=../.env tests/unit/<arquivo>.smoke.ts` a partir de `backend/`. Não introduzir vitest/jest.
- Contrato de resposta HTTP de `/api/v1/n8n-agent/run` não pode mudar de formato (n8n já consome `{ reply, sendPriceTable, priceTableVariant, sessionId, pausarIa }`) — suporte sempre manda `sendPriceTable:false, priceTableVariant:null`.
- Seguir nomenclatura do projeto: kebab-case pra arquivos, camelCase pra funções/variáveis (CLAUDE.md).
- Commits em Conventional Commits, na branch `develop` (branch atual do repo).

---

### Task 1: Conteúdo do suporte (`backend/agents/support/`)

**Files:**
- Create: `backend/agents/support/prompt-v1.md`
- Create: `backend/agents/support/rescheduling-rules.md`
- Create: `backend/agents/support/faq.md`
- Create: `backend/agents/support/knowledge-base.md`
- Create: `backend/agents/support/retention-flow.md`

**Interfaces:**
- Produces: arquivos `.md` lidos por `support.service.ts` (Task 6, `prompt-v1.md` via `readFileSync`) e auto-descobertos por `backend/scripts/ingest-knowledge.ts` (já existe, varre `backend/agents/support/*.md` com `agentType: 'support'` — nenhuma mudança nele necessária).

- [ ] **Step 1: Criar `backend/agents/support/prompt-v1.md`**

```markdown
Você é **Jessica**, da equipe da Results Idiomas, escola de idiomas 100%
online do Método Callan (inglês e espanhol). Aqui você atende quem já é
aluno matriculado — seu objetivo é resolver dúvidas rápido e, quando o
pedido exigir uma ação real de alguém da equipe, encaminhar sem enrolar o
aluno nem prometer algo que não pode confirmar sozinha.

## Identidade e tom

Ver `agents/shared/persona.md` — mesma persona do atendimento comercial:
"Jessica da equipe Results Idiomas", tom cordial e próximo, mensagens
curtas e fracionadas, emoji com moderação. Se perguntada diretamente se é
IA/robô, responde com honestidade.

## O que responder direto (usar CONTEXTO RELEVANTE da base de suporte)

- Dúvidas sobre o app Callan (acesso, funcionamento, problemas comuns).
- Horários de aula, planos contratados, materiais didáticos.
- Política de reagendamento — ver `agents/support/rescheduling-rules.md`
  pra explicar a regra, mas nunca confirmar um novo horário específico
  sozinha (isso é sempre handoff).
- Dúvidas gerais sobre o método Callan — pode reusar
  `agents/shared/school-info.md`.

## O que sempre escalar pra Gi (`needs_human=true`)

Nunca resolva como se tivesse concluído — reconheça o pedido com empatia,
explique que vai encaminhar pra alguém da equipe confirmar, e pare por
aí:

- Pedido de remarcar ou cancelar uma aula específica.
- Aviso de que o professor faltou ou a aula não aconteceu.
- Pedido de cancelamento de matrícula/contrato — ver
  `agents/support/retention-flow.md` antes de escalar.
- Reclamação séria (insatisfação com professor, cobrança, qualidade).
- Qualquer dado sensível de pagamento (CPF, comprovante PIX, cartão).

`escalation_reason` correspondente: `reagendamento`, `falta_professor`,
`cancelamento`, `reclamacao` ou `outro` (qualquer coisa que precise de
ação humana fora dessas categorias).

## Regra crítica — nunca confirmar ação que não pode garantir

**Isso é inegociável.** O agente não tem acesso à agenda real de aulas nem
ao sistema de matrícula. Nunca diga "prontinho, sua aula foi remarcada
pra X" ou "cancelamento confirmado" — só quem tem acesso ao sistema pode
confirmar isso. O agente reconhece o pedido, explica a regra aplicável
(ex: antecedência mínima) e escala.

## Regras rígidas

Ver `agents/shared/forbidden-phrases.md` — aplicam também ao suporte:
nunca inventar prazo/condição, nunca afirmar ser humana se perguntada,
nunca pedir/repetir dado de pagamento sensível.

## Sobre o CONTEXTO RELEVANTE injetado

Antes de cada resposta, trechos da base de conhecimento de suporte podem
vir anexados como "CONTEXTO RELEVANTE" — use esses dados pra responder
com precisão. Se a informação não estiver disponível, diga que vai
confirmar com a equipe em vez de arriscar.

## Formato de saída

Responda sempre com o objeto estruturado pedido pela integração — nunca
texto solto fora do schema: `reply` + `needs_human` (`true` só quando o
pedido exige ação real de alguém da equipe, ver seção acima) +
`escalation_reason` (um dos valores listados, ou `null` quando
`needs_human=false`).
```

- [ ] **Step 2: Criar `backend/agents/support/rescheduling-rules.md`**

```markdown
## Regra de antecedência

Reagendamento de aula exige no mínimo 3h de antecedência do horário
marcado. Pedido com menos de 3h não pode ser garantido — sinalizar isso
ao aluno e escalar mesmo assim, a equipe decide caso a caso.

## Aula particular

Pode ser remarcada, respeitando a regra de 3h de antecedência. O agente
reconhece o pedido e encaminha pra equipe confirmar o novo horário — não
tem acesso à agenda real dos professores.

## Aula em turma (até 4 alunos)

Aula perdida em turma **não tem reposição** — mesma lógica de curso em
grupo, a turma segue o cronograma combinado. O conteúdo é revisado a cada
aula, o que amortece falta pontual (ver `agents/shared/school-info.md`).
Não prometer reposição de turma em nenhuma hipótese.

## O agente nunca confirma novo horário sozinho

Toda remarcação, mesmo dentro da regra de 3h, precisa ser confirmada por
alguém da equipe com acesso à agenda real. O agente reconhece o pedido,
explica a regra de antecedência aplicável, e escalona
(`needs_human=true`, `escalation_reason=reagendamento`).
```

- [ ] **Step 3: Criar `backend/agents/support/faq.md`**

```markdown
## Dúvidas sobre o app Callan

⚠️ Aguardando conteúdo da Results: como baixar o app, como fazer login
pela primeira vez, problemas comuns de acesso, como entrar na aula pelo
link na hora certa.

## Dúvidas sobre horário e frequência

⚠️ Aguardando conteúdo da Results: como o aluno consulta o horário da
próxima aula, como saber quem é o professor da turma, o que fazer se o
link da aula não chegou.
```

- [ ] **Step 4: Criar `backend/agents/support/knowledge-base.md`**

```markdown
## Planos e materiais — alunos já matriculados

⚠️ Aguardando conteúdo específico da Results pra suporte (como consultar
o plano atual, como comprar material didático adicional). Enquanto isso
não vem, reusar os valores confirmados de material em
`agents/shared/school-info.md` (Callan English R$ 179,00 e Callan
Español R$ 199,00 por avanço de estágio) se o aluno perguntar.

## Canais de contato da equipe

⚠️ Aguardando conteúdo da Results: horário de atendimento humano, canal
específico pra dúvidas financeiras/contratuais (se houver um diferente
do WhatsApp da Gi).
```

- [ ] **Step 5: Criar `backend/agents/support/retention-flow.md`**

```markdown
## Fluxo de retenção — pedido de cancelamento

⚠️ Aguardando script de retenção da Results. Até lá, seguir esta regra
mínima: reconhecer o pedido com empatia, perguntar o motivo do
cancelamento sem insistir feito venda ("entendo, posso saber o motivo
pra gente melhorar?"), e sempre escalar
(`needs_human=true`, `escalation_reason=cancelamento`) — o agente nunca
processa nem confirma um cancelamento como feito.
```

- [ ] **Step 6: Commit**

```bash
git add backend/agents/support/prompt-v1.md backend/agents/support/rescheduling-rules.md backend/agents/support/faq.md backend/agents/support/knowledge-base.md backend/agents/support/retention-flow.md
git commit -m "feat(m2): conteudo inicial do agente de suporte (prompt + RAG)"
```

---

### Task 2: `support.schema.ts` — schema estruturado da resposta

**Files:**
- Create: `backend/src/agents/support/support.schema.ts`
- Test: `backend/tests/unit/support.schema.smoke.ts`

**Interfaces:**
- Produces: `ESCALATION_REASONS` (tuple), `EscalationReason` (type), `supportTurnSchema` (Zod schema), `SupportTurn` (type inferred), `supportResponseJsonSchema` (OpenAI `json_schema` config) — todos consumidos por `support.service.ts` (Task 6) e `EscalationReason` também por `agent.types.ts` (Task 5).

- [ ] **Step 1: Escrever o smoke test (falha por enquanto — módulo não existe)**

Create `backend/tests/unit/support.schema.smoke.ts`:

```typescript
import { supportTurnSchema } from '../../src/agents/support/support.schema.js';

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${label}: ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) console.log('  actual:', actual, 'expected:', expected);
}

const validNoEscalation = supportTurnSchema.safeParse({
  reply: 'Você acessa o app Callan pelo link enviado no e-mail de matrícula.',
  needs_human: false,
  escalation_reason: null,
});
check('valid, no escalation -> success', validNoEscalation.success, true);

const validWithEscalation = supportTurnSchema.safeParse({
  reply: 'Entendi, vou encaminhar pra equipe confirmar o novo horário.',
  needs_human: true,
  escalation_reason: 'reagendamento',
});
check('valid, with escalation -> success', validWithEscalation.success, true);

const invalidReason = supportTurnSchema.safeParse({
  reply: 'x',
  needs_human: true,
  escalation_reason: 'motivo_invalido',
});
check('invalid escalation_reason -> fails', invalidReason.success, false);

const missingReply = supportTurnSchema.safeParse({
  needs_human: false,
  escalation_reason: null,
});
check('missing reply -> fails', missingReply.success, false);

const emptyReply = supportTurnSchema.safeParse({
  reply: '',
  needs_human: false,
  escalation_reason: null,
});
check('empty reply -> fails', emptyReply.success, false);
```

- [ ] **Step 2: Rodar o teste, confirmar que falha (módulo não existe)**

Run (a partir de `backend/`): `npx tsx tests/unit/support.schema.smoke.ts`
Expected: erro de módulo não encontrado (`Cannot find module '../../src/agents/support/support.schema.js'`).

- [ ] **Step 3: Implementar `backend/src/agents/support/support.schema.ts`**

```typescript
import { z } from 'zod';

export const ESCALATION_REASONS = [
  'reagendamento',
  'cancelamento',
  'falta_professor',
  'reclamacao',
  'outro',
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const supportTurnSchema = z.object({
  reply: z.string().min(1),
  needs_human: z.boolean(),
  escalation_reason: z.enum(ESCALATION_REASONS).nullable(),
});

export type SupportTurn = z.infer<typeof supportTurnSchema>;

export const supportResponseJsonSchema = {
  name: 'support_turn',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      needs_human: { type: 'boolean' },
      escalation_reason: {
        type: ['string', 'null'],
        enum: [...ESCALATION_REASONS, null],
      },
    },
    required: ['reply', 'needs_human', 'escalation_reason'],
    additionalProperties: false,
  },
} as const;
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `npx tsx tests/unit/support.schema.smoke.ts`
Expected: 5 linhas, todas `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agents/support/support.schema.ts backend/tests/unit/support.schema.smoke.ts
git commit -m "feat(m2): schema estruturado da resposta do agente de suporte"
```

---

### Task 3: Generalizar handoff (`agents/commercial/commercial.handoff.ts` → `agents/shared/agent.handoff.ts`)

**Files:**
- Create: `backend/src/agents/shared/agent.handoff.ts`
- Modify: `backend/src/agents/commercial/commercial.service.ts:15,87`
- Delete: `backend/src/agents/commercial/commercial.handoff.ts`
- Modify (rename+update): `backend/tests/unit/commercial.handoff.smoke.ts` → `backend/tests/unit/agent.handoff.smoke.ts`

**Interfaces:**
- Consumes: `supabase` (`../../config/supabase.js`), `sendText` (`../../whatsapp/uazapi/uazapi.sender.js`), `env.GI_ALERT_NUMBER` (`../../config/env.js`), `logger` (`../../shared/logger.js`) — todos já existentes, mesmos usados por `commercial.handoff.ts` hoje.
- Produces: `notifyGi(contactId: string, phone: string, reason: string, lastReply: string): Promise<void>` — consumido por `commercial.service.ts` (este task) e `support.service.ts` (Task 6).

- [ ] **Step 1: Criar `backend/src/agents/shared/agent.handoff.ts`**

```typescript
import { supabase } from '../../config/supabase.js';
import { sendText } from '../../whatsapp/uazapi/uazapi.sender.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

export async function notifyGi(
  contactId: string,
  phone: string,
  reason: string,
  lastReply: string,
): Promise<void> {
  const { error } = await supabase.from('contacts').update({ pausar_ia: 'Sim' }).eq('id', contactId);
  if (error) throw error;

  if (!env.GI_ALERT_NUMBER) {
    logger.warn('GI_ALERT_NUMBER not configured, skipping handoff alert');
    return;
  }

  await sendText(
    env.GI_ALERT_NUMBER,
    `${reason}\nTelefone: ${phone}\nÚltima resposta da IA: ${lastReply}`,
  );
}
```

- [ ] **Step 2: Atualizar `commercial.service.ts` pra usar `notifyGi`**

In `backend/src/agents/commercial/commercial.service.ts`, replace line 15:

```typescript
import { handoffToGi } from './commercial.handoff.js';
```

with:

```typescript
import { notifyGi } from '../shared/agent.handoff.js';
```

And replace line 87:

```typescript
    await handoffToGi(contact.id, contact.phone, reply);
```

with:

```typescript
    await notifyGi(contact.id, contact.phone, 'Lead quente!', reply);
```

- [ ] **Step 3: Apagar `commercial.handoff.ts`**

```bash
git rm backend/src/agents/commercial/commercial.handoff.ts
```

- [ ] **Step 4: Renomear e atualizar o smoke test**

```bash
git mv backend/tests/unit/commercial.handoff.smoke.ts backend/tests/unit/agent.handoff.smoke.ts
```

Replace the full content of `backend/tests/unit/agent.handoff.smoke.ts` with:

```typescript
import { findOrCreateContact } from '../../src/crm/leads/contacts.repository.js';
import { notifyGi } from '../../src/agents/shared/agent.handoff.js';

const contact = await findOrCreateContact('5511977776666', 'Handoff Smoke Test');
console.log('contact:', contact.id, contact.pausar_ia);

await notifyGi(contact.id, contact.phone, 'Lead quente!', 'resposta de teste');

const after = await findOrCreateContact('5511977776666', 'Handoff Smoke Test');
console.log('pausar_ia after handoff:', after.pausar_ia, after.pausar_ia === 'Sim' ? 'PASS' : 'FAIL');
```

- [ ] **Step 5: Typecheck**

Run (a partir de `backend/`): `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Rodar o smoke test (precisa de `.env` real com Supabase configurado)**

Run: `npx tsx --env-file=../.env tests/unit/agent.handoff.smoke.ts`
Expected: última linha `pausar_ia after handoff: Sim PASS`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/agents/shared/agent.handoff.ts backend/src/agents/commercial/commercial.service.ts backend/tests/unit/agent.handoff.smoke.ts
git commit -m "refactor(agents): generaliza handoff pra Gi (commercial.handoff -> agent.handoff), reusado pelo suporte"
```

---

### Task 4: Generalizar reativação (`agents/commercial/commercial.reactivation.ts` → `agents/shared/agent.reactivation.ts`)

**Files:**
- Create: `backend/src/agents/shared/agent.reactivation.ts`
- Delete: `backend/src/agents/commercial/commercial.reactivation.ts`
- Modify: `backend/src/integrations/n8n-agent/n8n-agent.routes.ts:8`
- Test: `backend/tests/unit/agent.reactivation.smoke.ts`

**Interfaces:**
- Produces: `shouldReactivate(message: string): Promise<boolean>` — mesma assinatura de hoje, consumido por `n8n-agent.routes.ts` (este task e Task 7).

- [ ] **Step 1: Criar `backend/src/agents/shared/agent.reactivation.ts`**

```typescript
import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

const SYSTEM_PROMPT = `Um contato de uma escola de idiomas foi encaminhado pra atendimento humano
(pausar_ia='Sim') e agora mandou uma nova mensagem no WhatsApp. Classifique
se essa mensagem contém uma dúvida real que precisa de resposta, ou se é só
um encerramento/agradecimento sem necessidade de resposta.

Responda com exatamente uma palavra, sem pontuação: duvida ou encerrado.

duvida: pergunta sobre curso/preço/horário/aula/reagendamento, pedido de
ajuda, qualquer coisa que precise de resposta pra o contato seguir em
frente.
encerrado: agradecimento, confirmação simples ("ok", "tá bom", "👍"),
mensagem sem conteúdo que peça resposta.`;

const CLASSIFIER_TIMEOUT_MS = 3000;

/** true = mensagem parece uma duvida real, vale a pena reativar a IA por esse turno. */
export async function shouldReactivate(message: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const completion = await openai.chat.completions.create(
      {
        model: env.OPENAI_MODEL_ROUTER,
        temperature: 0,
        max_tokens: 5,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
      },
      { signal: controller.signal },
    );

    const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
    if (raw === 'duvida') return true;
    if (raw === 'encerrado') return false;

    logger.warn('reactivation classifier returned unexpected value, staying paused', { raw });
    return false;
  } catch (err) {
    logger.warn('reactivation classifier failed, staying paused', {
      errorMessage: (err as Error).message,
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 2: Apagar o arquivo antigo**

```bash
git rm backend/src/agents/commercial/commercial.reactivation.ts
```

- [ ] **Step 3: Atualizar o import em `n8n-agent.routes.ts`**

In `backend/src/integrations/n8n-agent/n8n-agent.routes.ts`, replace line 8:

```typescript
import { shouldReactivate } from '../../agents/commercial/commercial.reactivation.js';
```

with:

```typescript
import { shouldReactivate } from '../../agents/shared/agent.reactivation.js';
```

- [ ] **Step 4: Criar o smoke test**

Create `backend/tests/unit/agent.reactivation.smoke.ts`:

```typescript
import { shouldReactivate } from '../../src/agents/shared/agent.reactivation.js';

const doubt = await shouldReactivate('quanto custa remarcar minha aula de amanhã?');
console.log('duvida real ->', doubt);

const closed = await shouldReactivate('ok, obrigada 👍');
console.log('encerrado ->', closed);
```

- [ ] **Step 5: Typecheck**

Run (a partir de `backend/`): `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Rodar o smoke test (precisa de `OPENAI_API_KEY` real)**

Run: `npx tsx --env-file=../.env tests/unit/agent.reactivation.smoke.ts`
Expected: `duvida real -> true`, `encerrado -> false`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/agents/shared/agent.reactivation.ts backend/src/integrations/n8n-agent/n8n-agent.routes.ts backend/tests/unit/agent.reactivation.smoke.ts
git commit -m "refactor(agents): generaliza classificador de reativacao pos-pausa (commercial.reactivation -> agent.reactivation), reusado pelo suporte"
```

---

### Task 5: `support.service.ts` — motor do agente de suporte

**Files:**
- Modify: `backend/src/agents/shared/agent.types.ts`
- Create: `backend/src/agents/support/support.service.ts`

**Interfaces:**
- Consumes: `getChatHistory`/`appendChatMessage` (`../shared/agent.memory.redis.js`), `getOrCreateConversation`/`appendConversationTurn` (`../shared/agent.memory.pg.js`), `buildMessages` (`../shared/agent.context.js`), `retrieveKnowledgeContext` (`../../knowledge/knowledge.retrieval.js`, assinatura `(query: string, agentType: KnowledgeAgentType) => Promise<string>`), `sanitizeOutgoingText` (`../../shared/text-sanitizer.js`), `notifyGi` (`../shared/agent.handoff.js`, Task 3), `supportTurnSchema`/`supportResponseJsonSchema` (`./support.schema.js`, Task 2), `Contact` (`../../crm/leads/contacts.repository.js`).
- Produces: `SupportTurnResult { reply: string; handoff: boolean; escalationReason: EscalationReason | null }` (em `agent.types.ts`), `runSupportTurn(contact: Contact, instance: string, remoteJid: string, message: string, options?: { notifyHandoff?: boolean }): Promise<SupportTurnResult>` — consumido por `n8n-agent.routes.ts` (Task 6), `uazapi.webhook.ts` (Task 7) e `test-chat.routes.ts` (Task 8).

- [ ] **Step 1: Adicionar `SupportTurnResult` em `agent.types.ts`**

In `backend/src/agents/shared/agent.types.ts`, add the import and interface (keep the existing `AgentTurnResult` untouched):

```typescript
import type { PriceTableVariant } from '../commercial/commercial.schema.js';
import type { EscalationReason } from '../support/support.schema.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

export interface AgentTurnResult {
  reply: string;
  leadScore: number;
  handoff: boolean;
  sendPriceTable: boolean;
  priceTableVariant: PriceTableVariant;
}

export interface SupportTurnResult {
  reply: string;
  handoff: boolean;
  escalationReason: EscalationReason | null;
}
```

- [ ] **Step 2: Criar `backend/src/agents/support/support.service.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import type { Contact } from '../../crm/leads/contacts.repository.js';
import type { SupportTurnResult } from '../shared/agent.types.js';
import { getChatHistory, appendChatMessage } from '../shared/agent.memory.redis.js';
import { getOrCreateConversation, appendConversationTurn } from '../shared/agent.memory.pg.js';
import { buildMessages } from '../shared/agent.context.js';
import { supportTurnSchema, supportResponseJsonSchema } from './support.schema.js';
import type { EscalationReason } from './support.schema.js';
import { retrieveKnowledgeContext } from '../../knowledge/knowledge.retrieval.js';
import { sanitizeOutgoingText } from '../../shared/text-sanitizer.js';
import { notifyGi } from '../shared/agent.handoff.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROMPT_PATH = resolve(__dirname, '../../../../agents/support/prompt-v1.md');
const SYSTEM_PROMPT = readFileSync(PROMPT_PATH, 'utf-8');

function buildSystemPrompt(knowledgeContext: string): string {
  if (!knowledgeContext) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\nCONTEXTO RELEVANTE (base de conhecimento da Results — use pra responder com precisão, nunca invente política fora disso):\n${knowledgeContext}`;
}

const FALLBACK_REPLY =
  'Desculpa, tive um problema técnico aqui. Já vou repassar sua mensagem pra nossa equipe te responder, tá?';

const ESCALATION_LABELS: Record<EscalationReason, string> = {
  reagendamento: 'Aluno pediu reagendamento de aula',
  cancelamento: 'Aluno pediu cancelamento',
  falta_professor: 'Aviso de falta de professor',
  reclamacao: 'Reclamação de aluno',
  outro: 'Aluno precisa de atendimento humano',
};

export interface RunSupportTurnOptions {
  /** false pro console de teste — evita alertar a Gi via WhatsApp real com dado fictício */
  notifyHandoff?: boolean;
}

export async function runSupportTurn(
  contact: Contact,
  instance: string,
  remoteJid: string,
  message: string,
  options: RunSupportTurnOptions = {},
): Promise<SupportTurnResult> {
  const history = await getChatHistory(instance, remoteJid);
  const knowledgeContext = await retrieveKnowledgeContext(message, 'support');
  const messages = buildMessages(buildSystemPrompt(knowledgeContext), history, message);
  const conversation = await getOrCreateConversation(contact.id, 'support');

  let reply: string;
  let handoff = false;
  let escalationReason: EscalationReason | null = null;

  try {
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL_SUPPORT,
      messages,
      max_tokens: env.OPENAI_MAX_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: supportResponseJsonSchema,
      },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const turn = supportTurnSchema.parse(JSON.parse(raw));

    reply = sanitizeOutgoingText(turn.reply);
    handoff = turn.needs_human;
    escalationReason = turn.escalation_reason;

    await appendConversationTurn(conversation, message, reply, conversation.lead_score, {
      last_escalation_reason: escalationReason,
    });
  } catch (err) {
    logger.error('support turn failed, using fallback reply', {
      errorMessage: (err as Error).message,
    });
    reply = FALLBACK_REPLY;
  }

  await appendChatMessage(instance, remoteJid, { role: 'user', content: message, at: new Date().toISOString() });
  await appendChatMessage(instance, remoteJid, { role: 'assistant', content: reply, at: new Date().toISOString() });

  if (handoff && options.notifyHandoff !== false) {
    await notifyGi(contact.id, contact.phone, ESCALATION_LABELS[escalationReason ?? 'outro'], reply);
  }

  return { reply, handoff, escalationReason };
}
```

- [ ] **Step 3: Typecheck**

Run (a partir de `backend/`): `npm run typecheck`
Expected: sem erros. (Sem smoke test dedicado pro service — mesmo padrão de `commercial.service.ts`, que também não tem um: depende de Redis, só resolvível na VPS. Validação real acontece via console de teste, Task 8.)

- [ ] **Step 4: Commit**

```bash
git add backend/src/agents/shared/agent.types.ts backend/src/agents/support/support.service.ts
git commit -m "feat(m2): motor do agente de suporte (runSupportTurn)"
```

---

### Task 6: Ligar o roteador em `n8n-agent.routes.ts` (caminho real de produção)

**Files:**
- Modify: `backend/src/integrations/n8n-agent/n8n-agent.routes.ts`

**Interfaces:**
- Consumes: `routeAgent(contact: Contact, message: string): Promise<'commercial' | 'support'>` (`../../agents/router/agent.router.js`, já existe), `runCommercialTurn` (já importado), `runSupportTurn` (Task 5), `shouldReactivate` (Task 4, import já ajustado).

- [ ] **Step 1: Reescrever `backend/src/integrations/n8n-agent/n8n-agent.routes.ts`**

Replace the full file content with:

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { HttpError, BadRequestError, UnauthorizedError } from '../../shared/http-errors.js';
import { findOrCreateContact, updatePausarIa } from '../../crm/leads/contacts.repository.js';
import { routeAgent } from '../../agents/router/agent.router.js';
import { runCommercialTurn } from '../../agents/commercial/commercial.service.js';
import { runSupportTurn } from '../../agents/support/support.service.js';
import { shouldReactivate } from '../../agents/shared/agent.reactivation.js';
import { sendPriceTableImage } from '../../whatsapp/uazapi/uazapi.sender.js';
import { PRICE_TABLE_VARIANTS } from '../../agents/commercial/commercial.schema.js';

const bodySchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().min(1),
  contexto: z.record(z.string(), z.unknown()).optional(),
});

const sendPriceTableBodySchema = z.object({
  sessionId: z.string().min(1),
  variant: z.enum(PRICE_TABLE_VARIANTS).default('geral'),
});

function requireInternalAuth(request: FastifyRequest): void {
  const token = request.headers['x-internal-key'];
  if (token !== env.INTERNAL_API_KEY) {
    throw new UnauthorizedError('invalid internal key');
  }
}

function readString(contexto: Record<string, unknown> | undefined, key: string): string {
  const value = contexto?.[key];
  return typeof value === 'string' ? value : '';
}

interface RunResult {
  reply: string;
  sendPriceTable: boolean;
  priceTableVariant: string | null;
  handoff: boolean;
}

async function runRoutedTurn(
  contact: Awaited<ReturnType<typeof findOrCreateContact>>,
  instanceName: string,
  remoteJid: string,
  message: string,
  notifyHandoff: boolean,
): Promise<RunResult> {
  const agentType = await routeAgent(contact, message);

  if (agentType === 'support') {
    const turn = await runSupportTurn(contact, instanceName, remoteJid, message, { notifyHandoff });
    return { reply: turn.reply, sendPriceTable: false, priceTableVariant: null, handoff: turn.handoff };
  }

  const turn = await runCommercialTurn(contact, instanceName, remoteJid, message, { notifyHandoff });
  return {
    reply: turn.reply,
    sendPriceTable: turn.sendPriceTable,
    priceTableVariant: turn.sendPriceTable ? turn.priceTableVariant : null,
    handoff: turn.handoff,
  };
}

export async function n8nAgentRoutes(app: FastifyInstance) {
  app.post('/api/v1/n8n-agent/run', async (request: FastifyRequest, reply: FastifyReply) => {
    requireInternalAuth(request);

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError('invalid request body');

    const { message, sessionId, contexto } = parsed.data;
    // sessionId vem do n8n como message.chatid — mesmo valor usado como
    // remoteJid pelo caminho antigo (uazapi.webhook.ts).
    const remoteJid = sessionId;
    const phone = remoteJid.split('@')[0];
    const senderName = readString(contexto, 'senderName') || readString(contexto, 'chatName');
    const instanceName = readString(contexto, 'instanceName') || env.UAZAPI_INSTANCE;

    let contact;
    try {
      contact = await findOrCreateContact(phone, senderName);
    } catch (err) {
      logger.error('n8n-agent contact lookup failed', { sessionId, errorMessage: (err as Error).message });
      throw new HttpError(502, 'falha ao identificar contato');
    }

    if (contact.pausar_ia === 'Sim') {
      // Handoff já aconteceu (Gi está com o contato). Só volta a falar se a
      // mensagem for uma dúvida real — nunca reabre score/handoff de novo
      // (notifyHandoff:false) pra não reencaminhar/alertar a Gi de novo
      // pela mesma coisa. Depois de responder, volta pra pausado — a
      // próxima mensagem passa pela mesma checagem (ver ADR-011).
      const wantsToContinue = await shouldReactivate(message);
      if (!wantsToContinue) {
        return reply.send({
          reply: null,
          sendPriceTable: false,
          priceTableVariant: null,
          sessionId,
          pausarIa: 'Sim',
        });
      }

      const result = await runRoutedTurn({ ...contact, pausar_ia: 'Não' }, instanceName, remoteJid, message, false);
      await updatePausarIa(contact.id, 'Sim');

      return reply.send({
        reply: result.reply,
        sendPriceTable: result.sendPriceTable,
        priceTableVariant: result.priceTableVariant,
        sessionId,
        pausarIa: 'Sim',
      });
    }

    const result = await runRoutedTurn(contact, instanceName, remoteJid, message, true);
    const pausarIa = result.handoff ? 'Sim' : 'Não';

    return reply.send({
      reply: result.reply,
      sendPriceTable: result.sendPriceTable,
      priceTableVariant: result.priceTableVariant,
      sessionId,
      pausarIa,
    });
  });

  // Chamado pelo n8n só DEPOIS que todos os blocos de texto já foram
  // enviados (loop de fracionamento) — garante que a tabela chega depois
  // do "vou te mandar a tabela", nunca antes (ADR-012).
  app.post('/api/v1/n8n-agent/send-price-table', async (request: FastifyRequest, reply: FastifyReply) => {
    requireInternalAuth(request);

    const parsed = sendPriceTableBodySchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError('invalid request body');

    const { sessionId, variant } = parsed.data;

    try {
      await sendPriceTableImage(sessionId, variant);
    } catch (err) {
      logger.error('n8n-agent send-price-table failed', { sessionId, errorMessage: (err as Error).message });
      throw new HttpError(502, 'falha ao enviar tabela de precos');
    }

    return reply.send({ status: 'ok' });
  });
}
```

Nota: `runCommercialTurn` já aceita `{ notifyHandoff }` (assinatura existente, `RunCommercialTurnOptions`); `runSupportTurn` (Task 5) tem a mesma opção — por isso `runRoutedTurn` passa `notifyHandoff` pros dois sem branch extra.

- [ ] **Step 2: Typecheck**

Run (a partir de `backend/`): `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `dist/` gerado sem erros.

- [ ] **Step 4: Commit**

```bash
git add backend/src/integrations/n8n-agent/n8n-agent.routes.ts
git commit -m "feat(m2): liga roteador comercial/suporte no endpoint real do n8n (ADR-010)"
```

---

### Task 7: Completar o roteamento em `uazapi.webhook.ts` (caminho legado)

**Files:**
- Modify: `backend/src/whatsapp/uazapi/uazapi.webhook.ts`

**Interfaces:**
- Consumes: `runSupportTurn` (Task 5), `sendFractured` (`./uazapi.sender.js`, já importado).

- [ ] **Step 1: Adicionar o import de `runSupportTurn`**

In `backend/src/whatsapp/uazapi/uazapi.webhook.ts`, after line 11 (`import { runCommercialTurn } from '../../agents/commercial/commercial.service.js';`), add:

```typescript
import { runSupportTurn } from '../../agents/support/support.service.js';
```

- [ ] **Step 2: Substituir o branch final pelo suporte real**

Replace lines 112-123:

```typescript
    if (agentType === 'commercial') {
      const turn = await runCommercialTurn(contact, instanceName, remoteJid, joined);
      await sendFractured(remoteJid, turn.reply);
      // Tabela só depois do texto ter saído de verdade — nunca antes (ADR-012).
      if (turn.sendPriceTable) {
        await sendPriceTableImage(remoteJid, turn.priceTableVariant);
      }
      return reply.status(200).send({ status: 'ok', agentType, leadScore: turn.leadScore });
    }

    // M2 (support) plugs in here in a future session
    return reply.status(200).send({ status: 'ok', agentType });
```

with:

```typescript
    if (agentType === 'commercial') {
      const turn = await runCommercialTurn(contact, instanceName, remoteJid, joined);
      await sendFractured(remoteJid, turn.reply);
      // Tabela só depois do texto ter saído de verdade — nunca antes (ADR-012).
      if (turn.sendPriceTable) {
        await sendPriceTableImage(remoteJid, turn.priceTableVariant);
      }
      return reply.status(200).send({ status: 'ok', agentType, leadScore: turn.leadScore });
    }

    const supportTurn = await runSupportTurn(contact, instanceName, remoteJid, joined);
    await sendFractured(remoteJid, supportTurn.reply);
    return reply.status(200).send({ status: 'ok', agentType, handoff: supportTurn.handoff });
```

- [ ] **Step 3: Typecheck**

Run (a partir de `backend/`): `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add backend/src/whatsapp/uazapi/uazapi.webhook.ts
git commit -m "feat(m2): completa branch de suporte no webhook legado (sem trafego real hoje, ADR-010)"
```

---

### Task 8: Console de teste — `test-chat.routes.ts`

**Files:**
- Modify: `backend/src/agents/shared/agent.memory.pg.ts`
- Modify: `backend/src/testing/test-chat.routes.ts`

**Interfaces:**
- Consumes: `routeAgent` (`../agents/router/agent.router.js`), `runSupportTurn` (Task 5), `runCommercialTurn` (já importado), `findConversation` (novo, este task).
- Produces: `findConversation(contactId: string, agentType: 'commercial' | 'support'): Promise<Conversation | null>` em `agent.memory.pg.ts` — busca somente leitura, **não cria** conversa (ao contrário de `getOrCreateConversation`), usado pelo GET do console pra não gerar linha fantasma nem depender do classificador de intenção sem uma mensagem real pra classificar. Resposta HTTP do POST fica aditiva — mantém `leadScore`/`sendPriceTable` (default `0`/`false` pro suporte) e adiciona `agentType`/`escalationReason` sem remover campos que o console (Codex) já consome.

- [ ] **Step 1: Adicionar `findConversation` e o campo `updated_at` em `agent.memory.pg.ts`**

In `backend/src/agents/shared/agent.memory.pg.ts`, add `updated_at` to the `Conversation` interface and add a new read-only lookup function. Replace the interface (lines 4-12) with:

```typescript
export interface Conversation {
  id: string;
  contact_id: string;
  agent_type: 'commercial' | 'support';
  messages: ChatMessage[];
  lead_score: number;
  collected_data: Record<string, unknown>;
  stage: string;
  updated_at: string;
}
```

Then add this function after `getOrCreateConversation` (before `appendConversationTurn`):

```typescript
/** Só leitura — ao contrário de getOrCreateConversation, nunca cria linha nova. */
export async function findConversation(
  contactId: string,
  agentType: 'commercial' | 'support',
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', contactId)
    .eq('agent_type', agentType)
    .maybeSingle();

  if (error) throw error;
  return data as Conversation | null;
}
```

- [ ] **Step 2: Reescrever `backend/src/testing/test-chat.routes.ts`**

Replace the full file content with:

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';
import { UnauthorizedError, BadRequestError } from '../shared/http-errors.js';
import {
  findOrCreateContact,
  findContactByPhone,
  deleteContact,
} from '../crm/leads/contacts.repository.js';
import { findConversation } from '../agents/shared/agent.memory.pg.js';
import type { Conversation } from '../agents/shared/agent.memory.pg.js';
import { clearChatHistory } from '../agents/shared/agent.memory.redis.js';
import { clearBlock } from '../agents/shared/agent.pause.js';
import { routeAgent } from '../agents/router/agent.router.js';
import { runCommercialTurn } from '../agents/commercial/commercial.service.js';
import { runSupportTurn } from '../agents/support/support.service.js';
import { testChatSessionIdSchema, testChatMessageBodySchema } from './test-chat.schema.js';

const TEST_INSTANCE = 'test-console';

function testPhone(sessionId: string): string {
  return `test-${sessionId}`;
}

function requireTestConsoleAuth(request: FastifyRequest): void {
  const token = request.headers['x-test-console-token'];
  if (token !== env.TEST_CONSOLE_TOKEN) {
    throw new UnauthorizedError('invalid test console token');
  }
}

function parseSessionId(request: FastifyRequest): string {
  const { sessionId } = request.params as { sessionId?: string };
  const parsed = testChatSessionIdSchema.safeParse(sessionId);
  if (!parsed.success) throw new BadRequestError('invalid session id');
  return parsed.data;
}

/** Contato pode ter uma conversa comercial e uma de suporte (roteadas por mensagem, não por sessão) — mostra a mais recente. */
function pickMostRecent(a: Conversation | null, b: Conversation | null): Conversation | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a.updated_at) > new Date(b.updated_at) ? a : b;
}

export async function testChatRoutes(app: FastifyInstance) {
  app.get('/api/v1/test-chat/:sessionId/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    requireTestConsoleAuth(request);
    const sessionId = parseSessionId(request);

    const contact = await findContactByPhone(testPhone(sessionId));
    if (!contact) {
      return reply.send({ messages: [], leadScore: 0, collectedData: {} });
    }

    const [commercial, support] = await Promise.all([
      findConversation(contact.id, 'commercial'),
      findConversation(contact.id, 'support'),
    ]);
    const conversation = pickMostRecent(commercial, support);
    if (!conversation) {
      return reply.send({ messages: [], leadScore: 0, collectedData: {} });
    }

    return reply.send({
      messages: conversation.messages,
      leadScore: conversation.lead_score,
      collectedData: conversation.collected_data,
    });
  });

  app.post('/api/v1/test-chat/:sessionId/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    requireTestConsoleAuth(request);
    const sessionId = parseSessionId(request);

    const parsedBody = testChatMessageBodySchema.safeParse(request.body);
    if (!parsedBody.success) throw new BadRequestError('invalid message body');

    const contact = await findOrCreateContact(testPhone(sessionId), 'Teste (Console)');
    const agentType = await routeAgent(contact, parsedBody.data.message);

    if (agentType === 'support') {
      const turn = await runSupportTurn(contact, TEST_INSTANCE, sessionId, parsedBody.data.message, {
        notifyHandoff: false,
      });

      logger.info('test console turn', {
        sessionId,
        agentType,
        handoff: turn.handoff,
        escalationReason: turn.escalationReason,
      });

      return reply.send({
        reply: turn.reply,
        leadScore: 0,
        handoff: turn.handoff,
        sendPriceTable: false,
        agentType,
        escalationReason: turn.escalationReason,
      });
    }

    const turn = await runCommercialTurn(contact, TEST_INSTANCE, sessionId, parsedBody.data.message, {
      notifyHandoff: false,
    });

    logger.info('test console turn', {
      sessionId,
      agentType,
      leadScore: turn.leadScore,
      handoff: turn.handoff,
      sendPriceTable: turn.sendPriceTable,
    });

    return reply.send({
      reply: turn.reply,
      leadScore: turn.leadScore,
      handoff: turn.handoff,
      sendPriceTable: turn.sendPriceTable,
      agentType,
      escalationReason: null,
    });
  });

  app.delete('/api/v1/test-chat/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    requireTestConsoleAuth(request);
    const sessionId = parseSessionId(request);

    await clearChatHistory(TEST_INSTANCE, sessionId);
    await clearBlock(sessionId);

    const contact = await findContactByPhone(testPhone(sessionId));
    if (contact) await deleteContact(contact.id);

    logger.info('test console session reset', { sessionId });
    return reply.send({ status: 'reset' });
  });
}
```

Nota sobre o GET: `findConversation` só lê, nunca cria linha — evita poluir
o banco com conversas fantasma a cada poll do console, e evita chamar o
classificador de intenção sem uma mensagem real pra classificar (o POST é
quem decide o motor via `routeAgent` com a mensagem de verdade). Como um
contato pode ter uma conversa comercial e uma de suporte (roteadas por
mensagem, não fixas por sessão), `pickMostRecent` mostra a que teve
atividade mais recente.

- [ ] **Step 3: Typecheck**

Run (a partir de `backend/`): `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agents/shared/agent.memory.pg.ts backend/src/testing/test-chat.routes.ts
git commit -m "feat(m2): console de teste roteia entre comercial e suporte"
```

---

### Task 9: Ingestão da base de conhecimento + docs

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/CHANGELOG.md`

**Interfaces:** nenhuma (task de conteúdo/documentação, sem código).

- [ ] **Step 1: Rodar a ingestão da base de conhecimento**

Run (a partir de `backend/`, precisa de `.env` real com `SUPABASE_*` e `OPENAI_API_KEY`): `npm run ingest:knowledge`
Expected: log final `knowledge ingestion complete` com `totalChunks` > 0 incluindo os 5 arquivos novos de `agents/support/`.

- [ ] **Step 2: Atualizar `ROADMAP.md` — seção M2**

In `ROADMAP.md`, replace the M2 section (current lines ~122-146) with:

```markdown
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
```

- [ ] **Step 3: Adicionar entrada no `docs/CHANGELOG.md`**

At the top of `docs/CHANGELOG.md`, add:

```markdown
## [2026-07-22] - M2: agente de suporte + roteador comercial/suporte ligado

O que: `runSupportTurn` (novo motor de suporte, espelha `runCommercialTurn`:
RAG filtrado por `agent_type='support'`, structured output OpenAI
`{reply, needs_human, escalation_reason}`, persistência Redis+Supabase,
fallback textual em erro). Handoff pra Gi generalizado
(`commercial.handoff.ts` → `agents/shared/agent.handoff.ts`,
`notifyGi(contactId, phone, reason, lastReply)`) e reativação pós-pausa
generalizada (`commercial.reactivation.ts` → `agents/shared/agent.reactivation.ts`)
pra servir os dois motores. Roteador `routeAgent` (existia desde a Parte 4,
desconectado desde ADR-010) plugado nos 3 pontos de entrada: endpoint real
de produção (`n8n-agent.routes.ts`), webhook legado
(`uazapi.webhook.ts`, sem tráfego real hoje) e console de teste interno
(`test-chat.routes.ts`). Conteúdo inicial de `agents/support/*.md`: regra
de reagendamento (3h de antecedência, turma sem reposição) escrita como
fato real já documentado no projeto; FAQ/knowledge-base/retention-flow com
seções ⚠️ aguardando material da Results.

Por que: pedido do usuário — agente de suporte pra alunos matriculados,
decidindo comercial-vs-suporte por interpretação da primeira mensagem
(nunca perguntando), escalando pra humano qualquer ação real (remarcar,
cancelar, falta de professor, reclamação) em vez de inventar confirmação
que o sistema não pode garantir. Ver spec completa em
`docs/specs/2026-07-22-m2-support-agent-design.md`.

Arquivos: backend/agents/support/*.md (novos), backend/src/agents/support/*.ts
(novos), backend/src/agents/shared/agent.handoff.ts (novo, substitui
commercial.handoff.ts), backend/src/agents/shared/agent.reactivation.ts
(novo, substitui commercial.reactivation.ts), backend/src/agents/shared/agent.types.ts
(`SupportTurnResult`), backend/src/agents/commercial/commercial.service.ts
(usa `notifyGi`), backend/src/integrations/n8n-agent/n8n-agent.routes.ts,
backend/src/whatsapp/uazapi/uazapi.webhook.ts, backend/src/testing/test-chat.routes.ts,
backend/tests/unit/support.schema.smoke.ts (novo),
backend/tests/unit/agent.handoff.smoke.ts (renomeado),
backend/tests/unit/agent.reactivation.smoke.ts (novo), ROADMAP.md.

Impacto: contrato de resposta HTTP de `/api/v1/n8n-agent/run` não muda —
workflow n8n de produção (`qlkBgS35XBuSysN8`) não precisa de nenhum ajuste,
a decisão de qual motor responde é 100% interna ao backend. Ingestão
(`npm run ingest:knowledge`) roda contra o Supabase real, populando
`knowledge_chunks` com `agent_type='support'`. Sem tabela nova no banco.
Reagendamento efetivo, aniversário, pesquisa de satisfação e avaliação
Google seguem fora de escopo (bloqueados por falta de dado real da
Results, mesmo padrão do bloqueio B1 que existiu pro M1).
```

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md docs/CHANGELOG.md
git commit -m "docs(m2): atualiza ROADMAP e CHANGELOG com entrega do agente de suporte"
```

---

## Self-Review Notes

- **Cobertura da spec:** conteúdo/RAG (Task 1+9), `support.schema.ts` (Task 2), `notifyGi` genérico (Task 3), `shouldReactivate` genérico (Task 4), `runSupportTurn` (Task 5), roteador ligado nos 3 pontos de entrada (Tasks 6-8), docs (Task 9) — todas as seções da spec `docs/specs/2026-07-22-m2-support-agent-design.md` têm task correspondente. Itens marcados "fora de escopo" na spec (reagendamento efetivo, aniversário, pesquisa, avaliação Google) não têm task — intencional.
- **Consistência de tipos:** `EscalationReason` definido em `support.schema.ts` (Task 2), reusado em `agent.types.ts` (Task 5) e `support.service.ts` (Task 5) sem redefinição. `SupportTurnResult.escalationReason` (camelCase, campo do objeto TS) vs. `escalation_reason` (snake_case, campo do schema OpenAI/JSON) — nomenclatura intencionalmente diferente entre a fronteira do LLM (snake_case, igual ao padrão já usado em `commercial.schema.ts`) e o código interno (camelCase, igual a `leadScore`/`sendPriceTable` em `AgentTurnResult`).
- **Sem placeholders de implementação:** os ⚠️ nos arquivos de conteúdo (Task 1) são placeholders de **negócio** (aguardando material da Results), explicitamente aprovados pelo usuário na fase de brainstorming — não são placeholders de código/lógica.
