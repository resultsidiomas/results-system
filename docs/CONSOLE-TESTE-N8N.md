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

**O webhook de produção não é alterado.** O teste entra por um webhook próprio,
que reaproveita todo o resto do fluxo:

```
Webhook (produção, UAZAPI) ─┐
                            ├─► normalização ─► debounce ─► /n8n-agent/run
Webhook Teste ──────────────┘                                     │
(Respond to Webhook)                                              ▼
                                                     Fracionar ─► Split Out
                                                              ─► Loop Over Items
                                                                  │        │
                                                       (cada bolha)│        │(done)
                                                                  ▼        ▼
                                                            É teste?   [produção:
                                                            ├ não ─► UAZAPI  fim]
                                                            └ sim ─►           │
                                                          POST /test-bubble    ▼
                                                          (volta pro loop) É teste?
                                                                           └ sim ─►
                                                                      Montar resposta
                                                                      ─► Respond to
                                                                           Webhook
```

### A bolha aparece no painel na hora, não no fim

O `Respond to Webhook` responde **uma única vez** — não dá para o fluxo devolver
a primeira bolha, esperar, devolver a segunda. Se ele ficasse dentro do loop,
dispararia na primeira e o console receberia a resposta cortada, parecendo que o
agente respondeu curto.

Então a direção é invertida: no lugar do `POST /send/text` da UAZAPI, o ramo de
teste chama

```http
POST /api/v1/n8n-agent/test-bubble
Header: x-internal-key: <INTERNAL_API_KEY>

{ "sessionId": "test-teste-1", "text": "conteúdo da bolha" }
```

e volta para o loop. O painel busca essas bolhas enquanto o turno corre e mostra
cada uma assim que chega.

**O intervalo entre as bolhas na tela é o `Wait` real do fluxo.** O navegador só
exibe o que já aconteceu — não anima atraso nenhum. É por isso que a rota existe
em vez de o front simular a espera: simular daria a mesma aparência sem medir
nada.

A rota recusa (`400`) qualquer `sessionId` sem o prefixo `test-`, então um `IF`
mal configurado no fluxo não consegue desviar mensagem de lead de verdade para o
painel em vez do WhatsApp.

O loop roda inteiro nos dois modos. A única diferença é para onde o texto vai.

### Como o fluxo sabe que é teste

Testar `testMode` do payload é frágil: o campo se perde no meio da normalização,
do debounce e do Redis. O sinal confiável é o **telefone**, que atravessa o fluxo
inteiro porque é ele que vai no `number` do envio:

```
{{ ($json.number || $json.remoteJid || $json.chatid || '').startsWith('test-') }}
```

O backend garante o prefixo `test-` na origem (`shared/test-contact.ts`), e é o
mesmo sinal que a rota `/api/v1/n8n-agent/run` usa pra não alertar a Gi com dado
fictício. Uma verdade só, checada nos dois lados.

### 1. Aceitar a marcação de teste no webhook

O backend envia o payload no mesmo formato da UAZAPI (ver
`MAPA_ARQUITETURA_AGENTE_N8N.md` § "Contrato de entrada da UAZAPI"), com dois
extras:

```json
{
  "testMode": true,
  "instanceName": "test-console",
  "chat": { "wa_chatid": "test-teste-1", "wa_name": "Teste (Console)" },
  "message": {
    "id": "test-1754838000000",
    "content": "quero fazer aula de inglês",
    "text": "quero fazer aula de inglês",
    "messageType": "conversation",
    "fromMe": false,
    "chatid": "test-teste-1"
  }
}
```

> ⚠️ **`chatid` vem prefixado com `test-` e o fluxo não pode reescrever isso.**
> O fluxo repassa esse valor como `sessionId` para `/api/v1/n8n-agent/run`, que
> deriva dele o telefone do contato. É o prefixo que faz o backend reconhecer a
> conversa como teste — sem ele o contato vira lead comum: some do painel (que
> procura `test-{sessão}`), aparece na aba "Conversas reais", sobrevive ao
> "Zerar sessão" e dispara alerta de WhatsApp para a Gi com dado fictício.

Header opcional `x-test-secret`, com o valor de `N8N_TEST_SECRET`. Se você
configurar o secret, o fluxo deve rejeitar a execução quando ele não bater —
sem isso, qualquer pessoa que descubra a URL do webhook consegue disparar o
agente.

O webhook precisa estar em modo **"Respond to Webhook"** (e não "Immediately"),
senão o fluxo responde antes de ter a resposta do agente.

### 2. Debounce no teste (opcional)

O `Wait` de debounce existe para juntar mensagens que o lead manda em sequência.
No console a pessoa manda uma mensagem por vez e espera a resposta, então a
espera só faz o teste demorar.

**Recomendado: manter o debounce ligado também no teste.** O ponto do console é
exercitar o fluxo real, e o debounce é parte dele. Basta que
`N8N_TEST_TIMEOUT_MS` (default 90s) seja maior que a espera do fluxo somada ao
tempo de resposta do agente.

Se a espera atrapalhar o ritmo de trabalho, um `IF` com a mesma condição de
telefone (`startsWith('test-')`) antes do `Wait` pula a espera — ao custo de o
teste deixar de cobrir esse trecho.

### 3. Desviar do envio da UAZAPI

No ponto onde hoje o fluxo chama `POST {UAZAPI_URL}/send/text` dentro do loop
de blocos, entra o `IF` de telefone:

- **é teste** → não envia; volta para o `Loop Over Items` (a iteração segue
  normalmente, inclusive o `Wait`).
- **é produção** → caminho atual, sem alteração.

**Não responda aqui.** O `Respond to Webhook` fica na saída `done` do loop —
dentro do loop ele dispararia na primeira bolha e devolveria a resposta cortada.

O mesmo `IF` vale para a chamada de `/api/v1/n8n-agent/send-price-table`: em
teste ela não deve rodar. O painel mostra `sendPriceTable: true` na análise, que
é a informação que interessa (se a tabela **seria** enviada e qual variante).

### 3.1 Nodes para colar no n8n

Nomes de node variam de fluxo pra fluxo — ajuste as referências `$("...")`.

**Webhook Teste** (novo, não substitui o de produção):

```json
{
  "name": "Webhook Teste",
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 2,
  "parameters": {
    "httpMethod": "POST",
    "path": "results-teste",
    "responseMode": "responseNode",
    "options": {}
  }
}
```

A URL desse node é o valor de `N8N_TEST_WEBHOOK_URL`. Ligue a saída dele no
mesmo node em que o webhook de produção entrega a mensagem normalizada.

**É teste?** — antes do `POST /send/text`, dentro do loop:

```json
{
  "name": "É teste?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "parameters": {
    "conditions": {
      "combinator": "and",
      "options": { "caseSensitive": true, "typeValidation": "loose", "version": 2 },
      "conditions": [
        {
          "leftValue": "={{ ($json.number || $json.remoteJid || $json.chatid || '').toString() }}",
          "rightValue": "test-",
          "operator": { "type": "string", "operation": "startsWith" }
        }
      ]
    },
    "options": {}
  }
}
```

- saída **true** (é teste) → `HTTP Request` para `/api/v1/n8n-agent/test-bubble`
  → volta pro `Loop Over Items`
- saída **false** (produção) → `HTTP Request` da UAZAPI, sem alteração

**Bolha do teste** — no ramo true, no lugar do envio da UAZAPI:

```json
{
  "name": "Bolha do teste",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4,
  "parameters": {
    "method": "POST",
    "url": "={{ $env.BACKEND_URL }}/api/v1/n8n-agent/test-bubble",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "x-internal-key", "value": "={{ $env.INTERNAL_API_KEY }}" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ sessionId: ($json.number || $json.remoteJid || $json.chatid), text: ($json.text || $json.bloco || $json.output) }) }}",
    "options": {}
  }
}
```

Mantenha o `Wait` do loop ligado nos dois ramos: é ele que dá o ritmo que o
painel vai mostrar.

**Montar resposta do teste** — na saída `done` do loop:

```javascript
// Bolhas: os mesmos itens que teriam ido pra UAZAPI, na mesma ordem.
const bolhas = $('Split Out').all().map((item) =>
  item.json.text ?? item.json.bloco ?? item.json.output ?? String(item.json),
);

// Resposta crua do backend, pro painel mostrar score, handoff e tabela.
const agente = $('/n8n-agent/run').first().json;

return [{
  json: {
    reply: bolhas.join('\n'),
    bubbles: bolhas,
    sendPriceTable: agente.sendPriceTable ?? false,
    priceTableVariant: agente.priceTableVariant ?? null,
    pausarIa: agente.pausarIa ?? 'Não',
  },
}];
```

Depois desse Code node, o `Respond to Webhook`. Em produção a saída `done` segue
como já segue hoje — só acrescente um `IF` igual ao de cima se o mesmo ramo for
usado pelos dois.

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

1. **O alerta para a Gi não é disparado em nenhum dos dois caminhos.** No
   caminho `backend` por `notifyHandoff: false`; no caminho `n8n` porque
   `/api/v1/n8n-agent/run` reconhece o telefone sintético (`isTestPhone`) e
   suprime o aviso sozinha — o fluxo não precisa sinalizar nada. O handoff
   continua sendo **calculado** e aparece na análise do painel, que é o que
   interessa observar; só o WhatsApp com dado fictício deixa de sair.
2. **A checkbox "pular n8n"** força o caminho direto mesmo com o webhook
   configurado. Serve para isolar onde um problema está: se o comportamento
   errado aparece nos dois caminhos, é do agente; se aparece só via n8n, é do
   fluxo.
