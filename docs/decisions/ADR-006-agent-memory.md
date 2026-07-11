# ADR-006: Estratégia de Memória dos Agentes

## Status
**Aceito** — 2026-06-28

## Contexto

Os agentes precisam "lembrar" de conversas anteriores com o mesmo contato para:
- Não repetir perguntas já respondidas
- Continuar conversa de onde parou
- Construir contexto de qualificação progressiva
- Personalizar abordagem com base no histórico

Claude API não tem memória nativa entre chamadas — cada request é stateless.

## Decisão

**Context window com histórico persistido no Supabase**

```
Nova mensagem chega
  → buscar últimas 10 msgs da conversa (Supabase)
  → montar array messages[] para a API
  → chamar Claude API com histórico + system prompt
  → salvar resposta no Supabase
  → enviar resposta via UAZAPI
```

### Estrutura do contexto enviado à API

```typescript
messages: [
  // histórico (últimas 10 trocas = 20 mensagens)
  { role: "user",      content: "Oi, quero saber sobre inglês" },
  { role: "assistant", content: "Olá! Que bom ter você aqui..." },
  // ... até 10 pares
  // mensagem atual
  { role: "user",      content: mensagemAtual }
]
```

### Dados persistidos por conversa (Supabase)

```typescript
conversations {
  id
  contact_id          // FK → contacts
  agent_type          // 'commercial' | 'support'
  messages            // jsonb[] — histórico completo
  lead_score          // int — atualizado a cada turno
  collected_data      // jsonb — curso interesse, horário, objetivo...
  stage               // etapa do funil
  created_at
  updated_at
}
```

### Dados coletados progressivamente (commercial agent)

O agente vai coletando dados a cada mensagem e persistindo em `collected_data`:

```typescript
{
  interested_course: "inglês business",
  availability: "manhãs",
  frequency_per_week: 3,
  objective: "promoção no trabalho",
  urgency: "alta",
  budget_signal: "neutro",
  has_tried_before: true,
  family_decision: false
}
```

## Por que não usar outros mecanismos

| Alternativa | Por que não |
|------------|-------------|
| Resumo comprimido da conversa | Perde nuance, complexidade desnecessária agora |
| Embeddings + busca vetorial | Overkill para o volume atual, adiciona latência |
| Claude Projects / Memory | Não disponível via API |
| Cache de prompt | Útil para system prompt longo — avaliar depois |

## Limite de 10 mensagens

10 pares (20 mensagens) é o equilíbrio entre:
- Contexto suficiente para continuidade natural
- Custo controlado de tokens por request
- Latência aceitável

Se conversa for muito longa: manter as 10 mais recentes + resumo das anteriores em 1 linha no system prompt.

## Variáveis

```env
AGENT_HISTORY_LIMIT=10   # pares de mensagens no contexto
```
