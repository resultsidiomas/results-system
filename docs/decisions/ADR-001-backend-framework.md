# ADR-001: Framework Backend — Node.js + TypeScript + Fastify

## Status
**Aceito** — 2026-06-28

## Contexto

Precisamos de um backend capaz de:
- Hospedar APIs dos agentes de IA (M1, M2)
- Integrar com Claude API (Anthropic)
- Integrar com WhatsApp Business API (Meta)
- Integrar com Supabase
- Receber webhooks (WhatsApp, Meta)
- Servir dados para o frontend (M3, M4, M6)

Stack precisa ser mantida por equipe pequena, em ritmo acelerado de 5 semanas.

## Decisão

**Node.js + TypeScript + Fastify**

N8n foi **descartado como camada principal dos agentes de IA**. A lógica de
orquestração, contexto, scoring e memória dos agentes vive 100% no backend
Node.js — código, não fluxo visual.

N8n pode ser usado pontualmente para **features simples e periféricas**
(ex: disparo de campanhas sazonais, lembretes de cobrança) onde um fluxo
visual faz mais sentido do que código. Nunca para lógica crítica dos agentes.

## Alternativas Consideradas

### Python + FastAPI
- Prós: excelente para IA/ML, sintaxe limpa
- Contras: Claude API SDK é TypeScript-first; dois ecossistemas para manter;
  WhatsApp SDKs mais maduros em JS/TS
- Rejeitado

### Node.js + Express
- Prós: mais popular, mais exemplos na web
- Contras: sem tipagem de schema nativa, performance inferior ao Fastify,
  sem suporte nativo a plugins com controle de lifecycle
- Rejeitado em favor do Fastify

### Node.js + Bun
- Prós: performance superior
- Contras: ecossistema ainda imaturo, possíveis incompatibilidades com
  dependências críticas (WhatsApp SDK, etc)
- Descartado por risco operacional

## Consequências

- Stack completamente TypeScript — frontend (Codex) e backend (Claude Code) falam a mesma linguagem
- Fastify: schema validation nativa com JSON Schema / Zod, performance ~2x Express
- Claude API SDK (`@anthropic-ai/sdk`) funciona nativamente
- Supabase JS client funciona nativamente com types gerados
- N8n fica como ferramenta auxiliar para automações simples — nunca caminho crítico

## Dependências Principais

```json
{
  "fastify": "^4.x",
  "@anthropic-ai/sdk": "^0.x",
  "@supabase/supabase-js": "^2.x",
  "zod": "^3.x",
  "typescript": "^5.x"
}
```
