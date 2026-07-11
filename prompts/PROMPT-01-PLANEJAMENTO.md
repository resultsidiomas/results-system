# PROMPT 01 — ABERTURA DE SESSÃO + PLANEJAMENTO
## Results Idiomas × DROP Agency

> Colar no INÍCIO de toda sessão no Claude Code.
> Lê contexto → produz spec → aguarda aprovação → só então planeja.

---

## ATIVAÇÃO IMEDIATA

```
Caveman ULTRA ativo. Português. Sem fluff. Sem pleasantries.
Ler skills/caveman/SKILL.md agora. Aplicar pelo resto da sessão.
OFF only: "normal mode" / "para caveman".
```

---

## CONTEXTO — LER NESTA ORDEM ANTES DE QUALQUER RESPOSTA

```
1. CLAUDE.md                              → instruções, stack, convenções
2. ROADMAP.md                             → módulos, prioridades, ADRs
3. ORCHESTRATOR.md                        → fronteiras CC / Codex
4. docs/decisions/ADR-007-agent-architecture.md → arquitetura completa dos agentes
5. docs/DATABASE.md                       → schema — não criar tabelas duplicadas
6. docs/AGENTS.md                         → prompts e lógica M1/M2
7. agents/commercial/prompt-v1.md         → system prompt comercial
8. agents/commercial/scoring-rules.md     → scoring 0–10
```

---

## STACK CONFIRMADA (não questionar, não sugerir alternativas)

```
Backend:        Node.js + TypeScript + Fastify         (ADR-001)
Banco:          Supabase + Zod sem ORM                 (ADR-002)
Deploy:         EasyPanel na VPS                       (ADR-003)
WhatsApp msgs:  UAZAPI (conversas)                     (ADR-004)
WhatsApp disp:  Meta API Oficial (disparos)            (ADR-004)
Agentes IA:     OpenAI gpt-4.1-mini                     (ADR-008, supersede ADR-005)
Roteador IA:    OpenAI gpt-4.1-mini                     (ADR-008, supersede ADR-007)
Memória ctx:    Redis (15 trocas por sessão)           (ADR-006/007)
Memória hist:   PostgreSQL via Supabase                (ADR-006/007)
Realtime CRM:   Supabase Realtime                      (ADR-007)
Áudio→texto:    Groq Whisper large-v3-turbo            (ADR-007)
Imagem→texto:   Claude Vision                          (ADR-007)
Junção msgs:    Redis list + wait 45s                  (ADR-007)
Pausa humana:   Redis _block key TTL 3600s             (ADR-007)
```

---

## TAREFA DESTA SESSÃO

**{DESCREVA A TAREFA AQUI}**

Módulo: `{M1 / M2 / M3 / M4 / M5 / M6}`
Branch: `feature/{nome-kebab}`

---

## PROCESSO OBRIGATÓRIO — NÃO PULAR ETAPAS

### ETAPA 1 — ROTEAMENTO
Antes de qualquer coisa, responder:

```
TAREFA PERTENCE A: [ ] Claude Code  [ ] Codex
MOTIVO: ...
SE CODEX: gerar prompt de handoff e parar.
SE CLAUDE CODE: continuar para Etapa 2.
```

### ETAPA 2 — SPEC (preencher antes de planejar)

```
OBJETIVO:
MÓDULO:
TRIGGER: [o que dispara esta funcionalidade]
ARQUIVOS CRIAR:   [ ] ...
ARQUIVOS EDITAR:  [ ] ...
ARQUIVOS PROIBIDOS: frontend/* agents/* (sem instrução explícita)
DEPENDE DE:       [ ] tabela X  [ ] endpoint Y  [ ] env Z
NÃO PODE QUEBRAR: [ ] ...
ASSUNÇÕES:        ...

CRITÉRIOS DE ACEITE:
  CA-01: DADO ... QUANDO ... ENTÃO ...
  CA-02: ...

EDGE CASES:
  [ ] mensagem chega com fromMe=true → ignorar
  [ ] remoteJid no Redis _block → ignorar
  [ ] pausar_ia=Sim no Supabase → ignorar
  [ ] áudio → Groq → falha de transcrição → ?
  [ ] Redis fora do ar → fallback?
  [ ] Claude API timeout → ?
```

**PARAR. Apresentar spec. Aguardar confirmação antes de continuar.**

### ETAPA 3 — PLANO DE TASKS

Cada task: máx. 3 arquivos, testável em isolamento, deixa sistema funcionando.

```
TASK 1: [nome]
  Arquivo:  backend/src/[caminho exato]
  Ação:     CRIAR | EDITAR
  Faz:      [1 linha]
  Teste:    [comando ou verificação exata]
  Commit:   feat(m[n]): [descrição]

TASK 2: [nome]
  Depende:  TASK 1
  ...
```

**PARAR. Apresentar plano. Aguardar aprovação antes de implementar.**

### ETAPA 4 — IMPLEMENTAÇÃO (somente após aprovação)

Por task:
1. Implementar apenas aquela task
2. Rodar teste definido — mostrar output real
3. Security gate (ver abaixo)
4. `git add [só os arquivos desta task]`
5. `git commit -m "[tipo](m[n]): [descrição]"`
6. Reportar: `✅ TASK N concluída → próxima: TASK N+1`

### ETAPA 5 — VERIFICAÇÃO FINAL

```
[ ] Todos CAs marcados
[ ] Nenhum arquivo frontend/* tocado
[ ] Nenhum .env commitado
[ ] Todo input externo (webhook UAZAPI) validado com Zod
  → especialmente: remoteJid, messageType, fromMe
[ ] Redis keys usam padrão: {remoteJid}_block | {remoteJid} (list)
[ ] Logs não expõem: phone, pushName, conteúdo de mensagens
[ ] CHANGELOG.md atualizado
[ ] docs/API.md atualizado se criou endpoint
[ ] docs/contracts/ atualizado se Codex vai consumir
```

---

## SECURITY GATE (antes de cada commit)

```
[ ] Nenhum segredo/API key no código
[ ] Webhook UAZAPI valida token antes de processar
[ ] Supabase: queries usam service_role key apenas no backend
[ ] Redis: conexão usa REDIS_PASSWORD do .env
[ ] Groq key nunca exposta no frontend
[ ] Nenhum log com dados pessoais (nome, telefone, mensagem)
```

---

## SKILLS DESTA SESSÃO

```
skills/caveman/SKILL.md                      → ULTRA, sempre
skills/spec-driven-development/SKILL.md      → Etapa 2
skills/writing-plans/SKILL.md                → Etapa 3
skills/planning-and-task-breakdown/SKILL.md  → Etapa 3
skills/incremental-implementation/SKILL.md   → Etapa 4
skills/api-and-interface-design/SKILL.md     → endpoints
skills/security-and-hardening/SKILL.md       → webhook, auth, Redis
skills/verification-before-completion/SKILL.md → Etapa 5
skills/git-workflow-and-versioning/SKILL.md  → commits
skills/documentation-and-adrs/SKILL.md       → decisão arquitetural nova
skills/debugging-and-error-recovery/SKILL.md → quando algo quebrar
```

---

## REGRAS INEGOCIÁVEIS

```
1. Nunca implementar sem spec aprovada
2. Nunca tocar frontend/* sem instrução explícita
3. Nunca commitar .env
4. Nunca declarar "concluído" sem rodar o teste
5. Nunca mudar stack confirmada nos ADRs
6. Sempre usar Caveman Ultra
7. Sempre parar e registrar ADR se surgir decisão arquitetural nova
8. Redis keys SEMPRE no formato: {remoteJid}_block | {remoteJid}
9. Webhook UAZAPI SEMPRE validado com Zod antes de processar
10. fromMe=true SEMPRE ignorado imediatamente
```
