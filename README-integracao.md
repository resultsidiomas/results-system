# Integração agent-service ↔ n8n

## Status atual

- ✅ `agent-service` (backend Node/Express + OpenAI) construído e testado localmente em `agent-service/`
- ✅ Workflow n8n criado e **ativo**: `Agente - Entrada via Webhook` (id `qlkBgS35XBuSysN8`)
- ✅ Webhook testado ponta a ponta — recebe o payload corretamente
- ⚠️ **Pendente**: deploy do `agent-service` no EasyPanel, no mesmo projeto/rede do n8n. Sem isso, o node "Chamar Agente" falha com `ENOTFOUND agent-service` (testado e confirmado — ver seção Teste realizado).

## URL de produção do webhook

```
POST https://results-n8n.piyzzd.easypanel.host/webhook/agente-entrada
```

- Workflow ID: `qlkBgS35XBuSysN8`
- Método: `POST`
- Body esperado (JSON):
  ```json
  {
    "message": "texto da mensagem",
    "sessionId": "id-da-conversa",
    "contexto": { "qualquer": "campo extra opcional" }
  }
  ```

## Como testar com curl

```bash
curl -X POST https://results-n8n.piyzzd.easypanel.host/webhook/agente-entrada \
  -H "Content-Type: application/json" \
  -d '{"message":"Ola, isso e um teste","sessionId":"teste-001"}'
```

Resposta esperada (depois do deploy do agent-service):
```json
{ "reply": "...", "sessionId": "teste-001" }
```

## Deploy do agent-service no EasyPanel (passo que falta — você faz)

O hostname interno já foi ajustado no workflow com base no padrão real deste EasyPanel
(confirmado no Redis existente: `drop-agency_redis_results`). O node "Chamar Agente" já
aponta para `http://drop-agency_agent-service:3000/agent/run`.

1. No EasyPanel, dentro do **projeto `drop-agency`** (mesmo projeto do n8n e do Redis), criar um novo serviço chamado exatamente **`agent-service`**.
   - Se o EasyPanel gerar o hostname interno diferente de `drop-agency_agent-service`, me avise o nome real que eu ajusto a URL no node via API.
2. Build a partir de `agent-service/Dockerfile` (contexto = pasta `agent-service/` deste repo).
3. Variáveis de ambiente do `agent-service`:
   - `OPENAI_API_KEY` — **reutiliza a mesma chave já configurada** no backend principal (ADR-008), não precisa gerar nova
   - `OPENAI_MODEL` — `gpt-4.1-mini` (mesmo modelo usado pelos agentes M1/M2)
   - `INTERNAL_API_KEY` — string aleatória longa. **Já gerei uma sugestão para você — está só na mensagem de chat, não neste arquivo** (não commitamos secrets no repo). Gere a sua com `openssl rand -hex 32` se preferir outra.
   - `PORT=3000`
4. Variável de ambiente **no serviço do n8n** (não no agent-service):
   - `AGENT_INTERNAL_API_KEY` — **mesmo valor** usado em `INTERNAL_API_KEY` acima.
   - O node "Chamar Agente" lê esse valor via expressão `{{$env.AGENT_INTERNAL_API_KEY}}`, evitando colar o secret dentro do JSON do workflow. Depois de setar essa env no n8n, reinicie o serviço do n8n para a variável ser carregada.
5. Não expor a porta 3000 publicamente — só precisa ser alcançável na rede interna do projeto (sem domínio, sem SSL).
6. Depois do deploy, rodar o curl de teste abaixo de novo.

## Reativar / desativar o workflow via API

```bash
export N8N_API_KEY="<sua-key>"
WF_ID="qlkBgS35XBuSysN8"

# desativar
curl -X POST https://results-n8n.piyzzd.easypanel.host/api/v1/workflows/$WF_ID/deactivate \
  -H "X-N8N-API-KEY: $N8N_API_KEY"

# reativar
curl -X POST https://results-n8n.piyzzd.easypanel.host/api/v1/workflows/$WF_ID/activate \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

## Teste realizado (ponta a ponta parcial)

Execução `id: 2`, status `error` (esperado):
- Node `Webhook` → `executionStatus: success`, recebeu `body.message` e `body.sessionId` corretamente
- Node `Chamar Agente` → `executionStatus: error`, `getaddrinfo ENOTFOUND agent-service` (porque o serviço ainda não existe na rede)

Isso confirma que o n8n está roteando corretamente; falta só o deploy do agent-service para fechar o ciclo.

## ⚠️ Lembrete de segurança

A API key do n8n (JWT) usada para criar este workflow foi colada diretamente na conversa e é **temporária**. Depois de validar tudo:

1. Revogar essa key em n8n → Settings → API
2. Gerar uma key permanente com escopo mínimo necessário, se for automatizar mais criação de workflows
3. Nunca commitar `INTERNAL_API_KEY`, `OPENAI_API_KEY` ou a key do n8n em nenhum arquivo do repositório — todas ficam em variáveis de ambiente do EasyPanel
