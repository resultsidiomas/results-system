# Console de teste ligado ao fluxo n8n real

O painel (`frontend/`) tem uma área de testes onde a pessoa conversa com o
agente. A conversa roda de verdade em qualquer configuração — mesmo prompt,
mesma memória Redis, mesmo RAG, mesmo score, mesmo handoff. O que muda é **por
onde** a mensagem entra:

| Caminho | Quando acontece | O que exercita |
|---|---|---|
| `backend` | `N8N_TEST_WEBHOOK_URL` vazia | Engine completa do agente, sem a camada n8n (sem debounce e sem o fracionamento do fluxo) |
| `n8n` | `N8N_TEST_WEBHOOK_URL` preenchida | Fluxo real ponta a ponta: webhook, filtros, debounce/junção, chamada ao backend e fracionamento — só o envio pela UAZAPI é desviado |

O painel mostra qual caminho respondeu em cada turno (etiqueta no topo do chat
e campo "Caminho do último turno" na análise). Isso é proposital: um teste que
parece mais real do que foi é pior do que não testar.

**Em nenhum dos dois caminhos alguma mensagem é enviada por WhatsApp.**

---

## O que precisa ser adicionado no fluxo n8n

O fluxo de atendimento continua o mesmo. A mudança é um desvio no fim.

### 1. Aceitar a marcação de teste no webhook

O backend envia o payload no mesmo formato da UAZAPI (ver
`MAPA_ARQUITETURA_AGENTE_N8N.md` § "Contrato de entrada da UAZAPI"), com dois
extras:

```json
{
  "testMode": true,
  "instanceName": "test-console",
  "chat": { "wa_chatid": "teste-1", "wa_name": "Teste (Console)" },
  "message": {
    "id": "test-1754838000000",
    "content": "quero fazer aula de inglês",
    "text": "quero fazer aula de inglês",
    "messageType": "conversation",
    "fromMe": false,
    "chatid": "teste-1"
  }
}
```

Header opcional `x-test-secret`, com o valor de `N8N_TEST_SECRET`. Se você
configurar o secret, o fluxo deve rejeitar a execução quando ele não bater —
sem isso, qualquer pessoa que descubra a URL do webhook consegue disparar o
agente.

O webhook precisa estar em modo **"Respond to Webhook"** (e não "Immediately"),
senão o fluxo responde antes de ter a resposta do agente.

### 2. Pular o debounce quando `testMode` for verdadeiro

O `Wait` de debounce existe para juntar mensagens que o lead manda em
sequência. No console a pessoa manda uma mensagem por vez e espera a resposta,
então a espera só faz o teste demorar. Sugestão: um `IF` antes do `Wait`,
mandando `testMode = true` direto para o passo seguinte.

Se preferir manter o debounce ligado no teste (para exercitar também esse
trecho), suba `N8N_TEST_TIMEOUT_MS` acima do tempo de espera do fluxo.

### 3. Desviar do envio da UAZAPI

No ponto onde hoje o fluxo chama `POST {UAZAPI_URL}/send/text` dentro do loop
de blocos:

- `IF testMode = true` → **não envia**, segue para o `Respond to Webhook`.
- `IF testMode = false` → caminho normal de produção, sem alteração.

O mesmo vale para a chamada de `/api/v1/n8n-agent/send-price-table`: em teste
ela não deve rodar. O painel mostra `sendPriceTable: true` na análise, que é a
informação que interessa (se a tabela **seria** enviada e qual variante).

### 4. Responder ao chamador

Node `Respond to Webhook` devolvendo:

```json
{
  "reply": "texto completo, bolhas separadas por quebra de linha",
  "bubbles": ["primeira bolha", "segunda bolha"],
  "sendPriceTable": false,
  "priceTableVariant": "geral",
  "pausarIa": "Não"
}
```

`reply` é o único campo obrigatório. Se `bubbles` não vier, o painel fraciona
por quebra de linha. O backend também aceita `output` ou `text` no lugar de
`reply`, e aceita a resposta embrulhada em array ou em `{ json: ... }` — que é
como alguns nodes do n8n devolvem —, então um ajuste de node no fluxo não
quebra o console (`backend/src/testing/n8n-test-flow.ts`, função `normalize`).

### 5. Configurar o backend

```env
N8N_TEST_WEBHOOK_URL=https://SEU-N8N/webhook/results-atendimento
N8N_TEST_SECRET=um-segredo-qualquer
N8N_TEST_TIMEOUT_MS=90000
```

Reinicie o backend. O painel passa a mostrar a etiqueta verde "fluxo n8n real".

---

## Isolamento das conversas de teste

O contato de teste é gravado com telefone sintético `test-{sessão}` — nunca
colide com número real da UAZAPI, e o botão "Zerar sessão" apaga contato,
conversa, memória curta e bloqueio.

Duas ressalvas que valem saber ao ler um teste:

1. **O alerta para a Gi não é disparado** no caminho `backend`
   (`notifyHandoff: false`), para não mandar WhatsApp com dado fictício. Já no
   caminho `n8n`, o fluxo chama `/api/v1/n8n-agent/run` de produção, que
   **alerta de verdade** se o handoff acontecer. Se isso incomodar, mande o
   fluxo passar `notifyHandoff: false` no body quando `testMode` for
   verdadeiro (exige aceitar o campo na rota `n8n-agent.routes.ts`).
2. **A checkbox "pular n8n"** força o caminho direto mesmo com o webhook
   configurado. Serve para isolar onde um problema está: se o comportamento
   errado aparece nos dois caminhos, é do agente; se aparece só via n8n, é do
   fluxo.
