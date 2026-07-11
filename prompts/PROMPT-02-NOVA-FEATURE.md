# PROMPT 02 — PLANEJAR NOVA FEATURE OU MÓDULO
## Results Idiomas × DROP Agency

> Usar antes de qualquer feature nova.
> Esta sessão produz APENAS o plano. Proibido escrever código.

---

## REGRA NÚMERO UM

**Você não escreve nenhuma linha de código nesta sessão.**
Missão: plano completo e aprovado para outra sessão executar.
Escrever código antes da aprovação = falha na tarefa.

---

## ATIVAÇÃO

```
Caveman ULTRA. skills/caveman/SKILL.md. Português. Aplicar agora.
```

---

## FEATURE A PLANEJAR

**{DESCREVA O QUE PRECISA SER CONSTRUÍDO}**

Módulo: `{M1/M2/M3/M4/M5/M6}`
Prioridade: `{P0/P1/P2}`
Deadline: `{data}`

---

## ARQUITETURA DE REFERÊNCIA (ler antes de planejar)

### Fluxo de uma mensagem nos agentes

```
UAZAPI webhook POST /api/v1/webhook/whatsapp
  │
  ├─ Extrair: instance, remoteJid, messageType, fromMe, numero_limpo, pushName
  ├─ Guard: fromMe=true → ignorar
  ├─ Guard: instância inválida → ignorar
  │
  ├─ Supabase: contato existe? → não: INSERT novo lead
  ├─ Guard: contacts.pausar_ia='Sim' → ignorar
  ├─ Guard: Redis GET {remoteJid}_block → existe → ignorar
  │
  ├─ Tipo de mensagem:
  │   conversation / ExtendedTextMessage → texto direto
  │   audioMessage → UAZAPI download → Groq Whisper → texto
  │   imageMessage → UAZAPI download → Claude Vision → descrição
  │
  ├─ Junção de mensagens:
  │   Redis PUSH {remoteJid} ← mensagem
  │   Wait 45s
  │   Redis GET {remoteJid}
  │   IF última msg = msg atual → juntar, continuar
  │   ELSE → descartar (outra msg chegou depois)
  │
  ├─ Roteador:
  │   contact.type='student' OU intenção suporte → Agente M2
  │   contact.type='lead' OU intenção comercial → Agente M1
  │   (transição silenciosa — usuário não percebe)
  │
  ├─ Redis Chat Memory GET session={instance}{remoteJid} (15 trocas)
  │
  ├─ Claude API:
  │   model: claude-sonnet-4-6
  │   system: [prompt M1 ou M2]
  │   messages: [...histórico, { role:'user', content: msgFinal }]
  │
  ├─ Resposta → split('\n\n') → loop:
  │   UAZAPI POST /send/text (parágrafo)
  │   Wait 1500ms
  │
  ├─ Redis Chat Memory SAVE nova troca
  ├─ PostgreSQL: INSERT INTO conversations
  │
  └─ IF tool pausar_ia chamada:
      Redis SET {remoteJid}_block TTL=3600
      Supabase UPDATE contacts SET pausar_ia='Sim'
      Notificar Gi
```

### Redis — padrão de keys

```
{remoteJid}_block    → string 'true', TTL 3600s (pausa humana)
{remoteJid}          → list de mensagens (junção, 45s)
{instance}{remoteJid} → Redis Chat Memory (15 trocas)
```

### Supabase — tabelas core

```
contacts     → phone, type(lead|student), pausar_ia, score, stage
conversations → contact_id, agent_type, messages jsonb[], created_at
students     → contact_id, course, plan, teacher_id, schedule, stage
```

---

## PRODUZIR NESTA ORDEM (sem pular)

### 1. ENTENDIMENTO

```
PROBLEMA QUE RESOLVE:
USUÁRIO:          Gi / Edu / Vitor / Lead / Aluno / Sistema
TRIGGER:          [evento que dispara — mensagem WA / schedule / ação manual]
SEM ISSO ACONTECE:
MÓDULO ONDE ENTRA: M[n]
```

### 2. MAPEAMENTO DE DEPENDÊNCIAS

```
PRECISA EXISTIR ANTES:
  [ ] Redis rodando com REDIS_URL configurado
  [ ] Supabase: tabela [X] com campo [Y]
  [ ] UAZAPI: instância results-principal ativa
  [ ] env: [VARIAVEL] preenchida
  [ ] [outro prerequisito]

NÃO PODE QUEBRAR:
  [ ] Guard fromMe=true (sempre primeiro)
  [ ] Guard pausar_ia=Sim (sempre antes do agente)
  [ ] Guard _block no Redis (sempre antes do agente)
  [ ] Junção de mensagens (45s wait + Redis list)
  [ ] [funcionalidade existente X]

ARQUIVOS QUE TOCO:
  backend/src/[caminho]: [motivo]
```

### 3. SPEC TÉCNICA

```typescript
// Interfaces novas ou modificadas
interface [Nome] {
  // campos com tipos exatos
}

// Endpoints novos (se aplicável)
// METHOD /api/v1/[recurso] → [TipoResposta]

// Redis keys novas (se aplicável)
// KEY: [padrão]  TIPO: string|list|hash  TTL: [n]s

// Supabase changes (se aplicável)
// TABELA: [nome]  CAMPO NOVO: [campo]: [tipo]

// Groq (se envolve áudio)
// Trigger: messageType === 'audioMessage'
// Flow: UAZAPI download → binary → Groq → .text → mensagem

// Claude Vision (se envolve imagem)
// Trigger: messageType === 'imageMessage'
// Flow: UAZAPI download → base64 → Claude vision → descrição → mensagem
```

### 4. EDGE CASES ESPECÍFICOS DOS AGENTES

```
Sempre verificar para features que tocam no fluxo de mensagens:
[ ] fromMe=true → ignorado antes de qualquer processamento?
[ ] remoteJid com _block no Redis → ignorado?
[ ] pausar_ia=Sim no Supabase → ignorado?
[ ] Mensagem chega durante os 45s de wait → descartada corretamente?
[ ] Claude API retorna vazio ou erro → comportamento?
[ ] UAZAPI send falha → retry? log? silenciar?
[ ] Groq timeout em áudio longo → fallback?
[ ] Imagem sem conteúdo legível → resposta padrão?
[ ] Contato troca de lead para student mid-conversa → roteador recalcula?

EDGE CASES ESPECÍFICOS DESTA FEATURE:
[ ] [edge case 1] → [comportamento]
[ ] [edge case 2] → [comportamento]
```

### 5. CRITÉRIOS DE ACEITE

```
CA-01: DADO [contexto] QUANDO [evento] ENTÃO [resultado]
CA-02: DADO lead novo QUANDO manda "oi" ENTÃO agente responde < 3s
CA-03: DADO pausar_ia=Sim QUANDO nova msg chega ENTÃO ignorada sem resposta
CA-04: DADO 3 msgs em 20s QUANDO wait 45s ENTÃO juntas em 1 chamada Claude
CA-05: [específico desta feature]
```

### 6. TASKS (máx. 3 arquivos por task)

```
── TASK 1: [nome] ──────────────────────────────────
  Branch:  feature/m[n]-[descricao-kebab]
  Arquivo: backend/src/[caminho exato]
  Ação:    CRIAR | EDITAR
  Faz:     [1 linha]
  Zod:     [schema que valida input desta task]
  Teste:   [comando ou simulação exata]
  Commit:  feat(m[n]): [descrição]

── TASK 2: [nome] ──────────────────────────────────
  Depende: TASK 1
  Arquivo: backend/src/[caminho]
  Faz:     [1 linha]
  Teste:   [verificação]
  Commit:  feat(m[n]): [descrição]

── TASK migration (se mudar banco) ─────────────────
  Arquivo: database/migrations/[timestamp]_[nome].sql
  Faz:     [1 linha]
  Teste:   supabase gen types → sem erro
  Commit:  chore(db): [descrição]

── TASK env (se nova variável) ──────────────────────
  Arquivo: .env.example + CLAUDE.md (seção env)
  Novas vars:
    NOVA_VAR=          # descrição
  Commit:  chore(config): add [NOVA_VAR]

── TASK N: teste integração ────────────────────────
  Faz:     simular fluxo completo ponta a ponta
  Teste:   [simulação com curl ou script]
  Commit:  test(m[n]): [descrição]
```

### 7. CONTRATO DE API (se Codex vai consumir)

```typescript
// docs/contracts/[modulo]-contract.ts

// Endpoints
GET  /api/v1/[recurso]    → [Tipo]
POST /api/v1/[recurso]    → [Tipo]

// Tipos
interface [Tipo] {
  id: string;
  // ...
}

// Erros
// 400: [quando]  401: [quando]  404: [quando]  500: [quando]
```

### 8. NOVAS VARIÁVEIS DE AMBIENTE

```env
# [CATEGORIA]
NOVA_VAR=          # [descrição, onde obter]
```

### 9. RISCOS

```
RISCO 1: [descrição] → MITIGAÇÃO: [como tratar]
RISCO 2: Redis fora do ar durante junção → MITIGAÇÃO: [fallback]
RISCO 3: Groq indisponível → MITIGAÇÃO: [resposta padrão ou retry]
```

---

## RESUMO PARA APROVAÇÃO

```
════════════════════════════════
FEATURE:      [nome]
MÓDULO:       M[n]
TASKS:        [N] tasks
ARQUIVOS:     [N] criar / [N] editar
NOVAS ENV:    [lista ou "nenhuma"]
MIGRATION:    [sim/não]
BLOQUEADORES:
  [ ] [o que precisa existir antes]
════════════════════════════════
```

**Aguardar aprovação. Não implementar nada ainda.**

---

## SKILLS

```
skills/caveman/SKILL.md                      → ULTRA, sempre
skills/spec-driven-development/SKILL.md      → escrever spec
skills/writing-plans/SKILL.md                → formato do plano
skills/planning-and-task-breakdown/SKILL.md  → decompor tasks
skills/api-and-interface-design/SKILL.md     → endpoints
skills/documentation-and-adrs/SKILL.md       → decisão arquitetural
skills/doubt-driven-development/SKILL.md     → revisar plano
skills/security-and-hardening/SKILL.md       → checklist de segurança
```
