# ADR-007: Arquitetura Completa dos Agentes de IA

## Status
**Aceito** — 2026-06-28
> Nota: modelo dos agentes/roteador atualizado por [ADR-008](ADR-008-agent-model-openai.md) — Claude → OpenAI `gpt-4.1-mini`. Resto deste ADR permanece válido.

## Contexto

Análise do fluxo Vespa.json (agente de referência) revelou padrões consolidados
de produção para agentes WhatsApp com IA. Adaptamos para o projeto Results Idiomas
com dois agentes + um roteador, substituindo OpenAI por Claude API.

## Decisão

### Stack completa dos agentes

| Camada | Tecnologia | Função |
|--------|-----------|--------|
| Entrada de mensagens | UAZAPI webhook | Recebe texto, áudio, imagem do WhatsApp |
| Roteamento de tipo | Backend Node.js | Identifica tipo de mensagem (texto/áudio/imagem) |
| Transcrição de áudio | Groq API (`whisper-large-v3-turbo`) | Converte áudio → texto em PT-BR |
| Análise de imagem | Claude API (vision) | Descreve imagem → texto para o agente |
| Memória de conversa | Redis (`memoryRedisChat`) | Context window das últimas 15 trocas por sessão |
| Junção de mensagens | Redis (list + push) | Acumula msgs enviadas em sequência (wait 45s) |
| Pausa humana | Redis (`_block` key, TTL 3600s) | Bloqueia IA quando humano assume |
| Identificação de contato | Supabase (`contacts` table) | Verifica se lead/aluno já existe, cria se novo |
| Atualização em tempo real | Supabase Realtime | CRM atualiza pipeline ao vivo |
| Persistência de histórico | PostgreSQL (via Supabase) | Histórico completo de conversas |
| Roteador de agente | Backend Node.js | Decide comercial vs suporte sem revelar ao usuário |
| Agente Comercial (M1) | Claude API `claude-sonnet-4-6` | Qualifica leads, scoring, handoff para Gi |
| Agente Suporte (M2) | Claude API `claude-sonnet-4-6` | Reagendamentos, FAQs, retenção |
| Resposta WhatsApp | UAZAPI `/send/text` | Envia resposta fracionada em parágrafos |
| Disparos em massa | WhatsApp Oficial Meta | Campanhas, follow-ups programados (M5) |
| Tool: pausar_ia | Backend endpoint | Agente chama quando identifica necessidade de humano |

---

## Fluxo Completo — Mensagem Recebida

```
1. UAZAPI webhook → POST /api/v1/webhook/whatsapp
   Payload: { instanceName, chat.wa_chatid, message.content,
              message.messageType, message.fromMe, chat.wa_name,
              message.chatid, message.id }

2. Extração de dados
   instance    = body.instanceName
   remoteJid   = body.chat.wa_chatid
   messageType = body.message.messageType
   fromMe      = body.message.fromMe
   numero_limpo = body.message.chatid.split('@')[0]
   pushName    = body.chat.wa_name

3. Guard: fromMe === true → ignorar (mensagem enviada pelo próprio número)

4. Guard: instância válida? → se não, ignorar

5. Identificação de contato no Supabase
   SELECT * FROM contacts WHERE phone = numero_limpo
   → existe: continuar com dados existentes
   → não existe: INSERT (nome, phone, created_at, type='lead')

6. Guard: pausar_ia === 'Sim' no Supabase → ignorar (humano ativo)

7. Guard: Redis GET {remoteJid}_block → existe → ignorar (IA bloqueada por TTL)

8. Roteamento por tipo de mensagem:
   'conversation'        → usar texto direto
   'ExtendedTextMessage' → usar texto direto
   'audioMessage'        → download UAZAPI → Groq Whisper → texto
   'imageMessage'        → download UAZAPI → Claude Vision → descrição texto

9. Junção de mensagens (anti-flood):
   Redis PUSH {remoteJid} ← mensagem atual
   Wait 45 segundos
   Redis GET {remoteJid}
   IF última mensagem da lista === mensagem atual:
     Redis DELETE {remoteJid}
     Juntar todas com JOIN(' ') → mensagemFinal
   ELSE:
     Descartada — outra mensagem chegou, ela processa no final

10. Roteador de agente:
    Analisa mensagemFinal + histórico do contato no Supabase
    IF contato.type === 'lead' OU intenção comercial → Agente Comercial (M1)
    IF contato.type === 'student' OU intenção suporte → Agente Suporte (M2)
    Transição silenciosa — usuário não percebe troca

11. Redis Chat Memory GET session = {instance}{remoteJid}
    Últimas 15 trocas (configurável)

12. Claude API call:
    model: claude-sonnet-4-6
    system: [prompt do agente correto]
    messages: [...histórico, { role:'user', content: mensagemFinal }]
    max_tokens: 1024

13. Resposta do Claude → fracionar em parágrafos
    Split por \n\n → array de parágrafos
    Loop: para cada parágrafo:
      POST UAZAPI /send/text { remoteJid, text: parágrafo }
      Wait 1-2s entre envios (simula digitação humana)

14. Redis Chat Memory SAVE nova troca
    PostgreSQL: INSERT INTO conversations (contact_id, agent_type, messages, ...)

15. IF agente chamou tool pausar_ia:
    Redis SET {remoteJid}_block = true (TTL: 3600s)
    Supabase UPDATE contacts SET pausar_ia = 'Sim' WHERE phone = numero_limpo
    Notificação para Gi via UAZAPI (número interno)
```

---

## Fluxo: Retomada da IA (Schedule Trigger)

```
Todo dia às 08:00:
  Supabase SELECT * FROM contacts WHERE pausar_ia = 'Sim'
  Para cada contato:
    Supabase UPDATE contacts SET pausar_ia = 'Não'
    Redis DELETE {remoteJid}_block
    Wait entre iterações
```

Resultado: IA retomada automaticamente no dia seguinte após pausa humana.

---

## Roteador de Agente — Lógica Detalhada

```typescript
// backend/src/agents/shared/agent.router.ts

async function routeAgent(contact: Contact, message: string): Promise<AgentType> {
  // Regra 1: tipo do contato
  if (contact.type === 'student') return 'support'
  if (contact.type === 'lead') return 'commercial'

  // Regra 2: intenção da mensagem (Claude API call rápido)
  const intent = await classifyIntent(message)
  // intent: 'commercial' | 'support' | 'ambiguous'

  if (intent === 'support') return 'support'
  return 'commercial' // default: comercial para leads ambíguos
}

// Sinais de suporte: "remarcar", "cancelar", "professor", "faltou",
//   "horário", "app", "Callan", "dúvida sobre aula"
// Sinais comercial: "quanto custa", "quero fazer", "inglês", "curso",
//   "valor", "preço", "matrícula", "experimental"
```

**Transição silenciosa:** o usuário jamais vê mensagem de "transferindo para outro setor".
O contexto do Redis é compartilhado — o novo agente lê o histórico e continua naturalmente.

---

## Groq API — Transcrição de Áudio

```
Provider: Groq (https://api.groq.com/openai/v1/audio/transcriptions)
Modelo:   whisper-large-v3-turbo
Formato:  multipart/form-data com binary do arquivo
Language: pt
Response: verbose_json → campo .text
Motivo:   gratuito para volume inicial, latência < 1s, excelente PT-BR
```

---

## Variáveis de Ambiente Completas

```env
# Claude (agentes)
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL_COMMERCIAL=claude-sonnet-4-6
CLAUDE_MODEL_SUPPORT=claude-sonnet-4-6
CLAUDE_MODEL_ROUTER=claude-haiku-4-5-20251001
CLAUDE_MAX_TOKENS=1024

# Supabase (identificação, atualização ao vivo, histórico)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# PostgreSQL direto (memória persistente dos agentes)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Redis (junção de msgs + pausa humana + memória de contexto)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=...
AGENT_MESSAGE_WAIT_MS=45000      # tempo de espera para juntar msgs
AGENT_BLOCK_TTL_SECONDS=3600     # TTL da pausa humana (1h)
AGENT_HISTORY_LIMIT=15           # trocas no contexto Redis

# UAZAPI (conversas WhatsApp)
UAZAPI_URL=https://sua-instancia.uazapi.com
UAZAPI_TOKEN=...
UAZAPI_INSTANCE=results-principal
UAZAPI_SEND_DELAY_MS=1500        # delay entre parágrafos enviados

# WhatsApp Business API Oficial (disparos em massa)
WA_API_TOKEN=...
WA_PHONE_NUMBER_ID=...
WA_BUSINESS_ACCOUNT_ID=...

# Groq (transcrição de áudio)
GROQ_API_KEY=...
GROQ_MODEL=whisper-large-v3-turbo

# App
NODE_ENV=production
PORT=3000
SCHEDULE_RESUME_HOUR=8           # hora de retomada automática da IA
```

---

## Estrutura de Pastas — Agentes (atualizada)

```
backend/src/agents/
├── router/
│   ├── agent.router.ts          # decide comercial vs suporte
│   └── intent.classifier.ts     # classifica intenção com Claude Haiku
├── commercial/                  # M1
│   ├── commercial.service.ts    # orquestração da conversa
│   ├── commercial.scoring.ts    # lead scoring 0–10
│   ├── commercial.handoff.ts    # handoff para Gi
│   ├── commercial.followup.ts   # cadência 3/7/14 dias
│   └── commercial.schema.ts
├── support/                     # M2
│   ├── support.service.ts
│   ├── support.reschedule.ts    # regra das 3h
│   ├── support.retention.ts     # anti-cancelamento
│   └── support.schema.ts
└── shared/
    ├── agent.context.ts         # monta messages[] para Claude API
    ├── agent.memory.redis.ts    # lê/escreve Redis Chat Memory
    ├── agent.memory.pg.ts       # persiste histórico no PostgreSQL
    ├── agent.pause.ts           # lógica de pausar/retomar IA
    ├── agent.message-join.ts    # lógica de junção de mensagens (45s)
    ├── agent.fracture.ts        # fraciona resposta em parágrafos
    └── agent.types.ts

backend/src/whatsapp/
├── uazapi/
│   ├── uazapi.webhook.ts        # recebe msgs da UAZAPI
│   ├── uazapi.sender.ts         # envia texto fracionado
│   ├── uazapi.download.ts       # baixa áudio/imagem
│   └── uazapi.schema.ts         # Zod — valida payload do webhook
└── official/
    ├── official.sender.ts        # disparos via Meta API
    └── official.templates.ts     # templates aprovados

backend/src/media/
├── audio.transcriber.ts         # Groq Whisper
└── image.analyzer.ts            # Claude Vision
```

---

## Decisões Técnicas Derivadas

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Tempo de espera junção | 45s | Mesmo do Vespa — testado em produção |
| TTL pausa humana | 3600s (1h) | Gi tem 1h para assumir antes de IA retomar |
| Retomada automática | 08:00 diário | Limpa pausas da noite anterior |
| Memória Redis | 15 trocas | Contexto suficiente, custo controlado |
| Fracionamento | Split por `\n\n` | Simula mensagens naturais do WhatsApp |
| Delay entre parágrafos | 1500ms | Simula digitação humana |
| Áudio → texto | Groq Whisper | Gratuito, rápido, ótimo PT-BR |
| Imagem → texto | Claude Vision | Já na stack, sem SDK extra |
| Roteador | Claude Haiku | Classificação rápida e barata |
