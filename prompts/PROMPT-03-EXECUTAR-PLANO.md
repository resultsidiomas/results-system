# PROMPT 03 — EXECUTAR PLANO APROVADO
## Results Idiomas × DROP Agency

> Usar após aprovação do plano (Prompt 02).
> Uma task por vez. Gate de verificação entre cada uma. Sem improvisos.

---

## ATIVAÇÃO

```
Caveman ULTRA. skills/caveman/SKILL.md. Aplicar agora.
```

---

## PLANO A EXECUTAR

```
[COLAR AQUI O PLANO APROVADO DO PROMPT 02]
```

---

## REGRA DESTA SESSÃO

```
Uma task por vez.
Não avança sem confirmar a anterior.
Não declara done sem rodar o teste.
Não toca arquivos fora do escopo da task.
Não expande o escopo.
Encontrou inesperado → PARA → reporta → aguarda instrução.
```

---

## CARREGAR NO INÍCIO

```
CLAUDE.md                              → confirmar Caveman Ultra ativo
docs/decisions/ADR-007-agent-architecture.md → arquitetura agentes
docs/DATABASE.md                       → antes de qualquer query
.env.example                           → confirmar vars disponíveis
```

---

## PROTOCOLO POR TASK

```
╔══════════════════════════════════════╗
║  TASK [N]: [nome]                    ║
║  Branch:   [nome]                    ║
║  Arquivo:  [caminho]                 ║
╚══════════════════════════════════════╝
```

**PRÉ-FLIGHT**
```
[ ] Arquivo existente lido antes de editar
[ ] Nenhum outro arquivo já faz o mesmo
[ ] Branch correta ativa
[ ] Nenhum _block Redis, pausar_ia, fromMe esquecido no fluxo
```

**IMPLEMENTAR**
Apenas o necessário para esta task.
Sem "já que estou aqui vou também...".

Se a task envolve webhook UAZAPI → Zod obrigatório:
```typescript
const webhookSchema = z.object({
  body: z.object({
    instanceName: z.string(),
    chat: z.object({
      wa_chatid: z.string(),
      wa_name: z.string(),
    }),
    message: z.object({
      id: z.string(),
      content: z.string().optional(),
      messageType: z.enum(['conversation','audioMessage','imageMessage','ExtendedTextMessage']),
      fromMe: z.boolean(),
      chatid: z.string(),
    }),
  }),
})
```

Se a task envolve Redis → usar padrão de keys:
```typescript
const KEYS = {
  block:  (jid: string) => `${jid}_block`,
  msgList:(jid: string) => jid,
  memory: (instance: string, jid: string) => `${instance}${jid}`,
}
```

**VERIFICAR**
```bash
$ [comando exato]
[mostrar output real — não inventar]
```
Falhou → diagnostica → corrige → re-verifica. Não avança com falha.

**SECURITY GATE (antes de commitar)**
```
[ ] Sem segredo/API key no código
[ ] fromMe=true: ignorado ANTES de qualquer lógica
[ ] Supabase pausar_ia: verificado ANTES do agente
[ ] Redis _block: verificado ANTES do agente
[ ] Webhook: Zod parse antes de usar qualquer campo
[ ] Redis: REDIS_PASSWORD do .env — nunca hardcoded
[ ] Groq key: nunca no frontend ou log
[ ] Logs: sem phone, pushName, conteúdo de mensagem
[ ] UAZAPI token: header do request, nunca no corpo
```

**COMMITAR**
```bash
git add [APENAS os arquivos desta task]
git commit -m "[tipo](m[n]): [descrição exata do plano]"
```

**REPORTAR**
```
✅ TASK [N] concluída
   Arquivos: [lista]
   Teste: PASSOU — [output resumido]
   Próxima: TASK [N+1] — [nome]
```

---

## CASOS ESPECIAIS

### Bug fora do escopo
```
⚠️ BUG FORA DO ESCOPO
Arquivo: [caminho:linha]
Problema: [descrição]
Bloqueia esta task: [sim/não]
→ Registrando em docs/CHANGELOG.md como pending fix.
→ Continuando task atual.
```

### Task maior que o esperado
```
⚠️ SCOPE CREEP
Task [N] mais complexa que estimado.
Encontrei: [descrição]
Opções:
  A) Dividir: [proposta]
  B) Simplificar: [abordagem]
→ Aguardando decisão.
```

### Decisão arquitetural não prevista
```
⚠️ DECISÃO ARQUITETURAL NECESSÁRIA
Situação: [contexto]
Opção A: [descrição] Prós: [...] Contras: [...]
Opção B: [descrição] Prós: [...] Contras: [...]
→ Não implementando nenhuma sem confirmação.
→ Se aprovado, registrar em docs/decisions/ADR-00X-[nome].md
```

### Redis indisponível durante implementação
```
⚠️ REDIS INDISPONÍVEL
Impacto: junção de msgs + memória de contexto + pausa humana afetados
Fallback implementado: [descrição ou "nenhum por ora"]
→ Reportar para que VPS/EasyPanel seja verificado antes do teste.
```

---

## CHECKLIST FINAL — APÓS TODAS AS TASKS

```
VERIFICAÇÃO FINAL
═════════════════════════════════════════
[ ] Todas [N] tasks commitadas
[ ] Todos os testes passando — outputs reais mostrados
[ ] Nenhum arquivo frontend/* tocado
[ ] Nenhum .env commitado
[ ] Webhook UAZAPI: Zod schema cobrindo todos os campos usados
[ ] Guards de ordem correta:
      1. fromMe=true → ignorar
      2. instância válida → verificar
      3. Supabase pausar_ia=Sim → ignorar
      4. Redis _block → ignorar
      5. [processar mensagem]
[ ] Redis keys no padrão: {jid}_block | {jid} | {instance}{jid}
[ ] CHANGELOG.md atualizado:
      ## [data] — M[n]: [nome da feature]
      O quê: ...
      Por quê: ...
      Arquivos: ...
      Impacto: ...
[ ] docs/API.md atualizado (se criou endpoints)
[ ] docs/contracts/ atualizado (se Codex vai consumir)
[ ] .env.example atualizado (se novas vars)
[ ] Branch pronta para review
```

---

## RELATÓRIO DE CONCLUSÃO

```
╔═══════════════════════════════════════════╗
║         IMPLEMENTAÇÃO CONCLUÍDA           ║
╠═══════════════════════════════════════════╣
║  Feature:  [nome]                         ║
║  Módulo:   M[n]                           ║
║  Tasks:    [N]/[N]                        ║
║  Commits:  [N]                            ║
║  Branch:   feature/[nome] → pronta        ║
╠═══════════════════════════════════════════╣
║  TESTADO:                                 ║
║  [teste 1: PASSOU]                        ║
║  [teste 2: PASSOU]                        ║
╠═══════════════════════════════════════════╣
║  PRÓXIMOS PASSOS:                         ║
║  [ ] Review arquiteto                     ║
║  [ ] Merge → develop                      ║
║  [ ] [dependências desbloqueadas]         ║
╚═══════════════════════════════════════════╝
```

---

## SKILLS

```
skills/caveman/SKILL.md                        → ULTRA, sempre
skills/executing-plans/SKILL.md                → execução task a task
skills/incremental-implementation/SKILL.md     → um arquivo por vez
skills/verification-before-completion/SKILL.md → antes de declarar done
skills/security-and-hardening/SKILL.md         → security gate
skills/git-workflow-and-versioning/SKILL.md    → commits e branches
skills/debugging-and-error-recovery/SKILL.md   → quando quebrar
skills/observability-and-instrumentation/SKILL.md → ao adicionar logs
```
