# Mapa da arquitetura do agente e fluxo n8n

Documento para orientar outra IA a recriar um fluxo equivalente ao que ja existe, usando como base:

- Fluxo n8n de referencia: `Vespa (1).json`
- Backend do projeto Results Idiomas: `backend/src`
- Decisoes tecnicas: `docs/decisions/ADR-007`, `ADR-009`, `ADR-010`, `ADR-011`, `ADR-012`

Este documento nao e um tutorial generico de n8n. Ele descreve as conexoes reais, os contratos entre sistemas e a ordem correta das etapas.

## Visao geral

Existem duas arquiteturas relacionadas:

1. **Vespa original no n8n**
   - O proprio n8n recebe o webhook da UAZAPI.
   - O n8n normaliza a mensagem, baixa audio/imagem, transcreve audio, analisa imagem, usa Redis, chama um AI Agent interno do n8n e envia a resposta pela UAZAPI.
   - O agente e configurado diretamente dentro do node `AI Agent1`.

2. **Results Idiomas atual**
   - O n8n continua sendo a camada de entrada do WhatsApp.
   - O n8n faz filtros, debounce/juncao de mensagens e envio final.
   - A resposta inteligente vem do backend em `POST /api/v1/n8n-agent/run`.
   - O backend executa a engine real do agente comercial: prompt versionado, RAG, memoria, score, tabela de precos e handoff.

Para recriar o fluxo atual da Results, use a Vespa como referencia de desenho operacional, mas mantenha a inteligencia principal no backend.

## Sistemas conectados

| Sistema | Funcao |
|---|---|
| WhatsApp / UAZAPI | Receber mensagens e enviar texto/midia |
| n8n | Orquestracao do webhook, filtros, debounce e envio |
| Backend Fastify | Engine do agente, regras, memoria, RAG, score e handoff |
| OpenAI | Chat do agente, classificador e embeddings |
| Groq | Transcricao de audio com Whisper, quando o fluxo tratar audio |
| Redis | Memoria curta, debounce e bloqueios temporarios |
| Supabase/Postgres | Contatos, conversas, score, dados coletados e knowledge base |
| pgvector | Busca semantica da base de conhecimento |

## Fluxo macro recomendado

```text
UAZAPI
  -> n8n Webhook
  -> extrair campos principais
  -> ignorar mensagens invalidas/fromMe/testes fora da allowlist
  -> resolver texto final da mensagem
  -> juntar mensagens em janela curta
  -> POST backend /api/v1/n8n-agent/run
  -> fracionar resposta em blocos
  -> enviar blocos pela UAZAPI
  -> se backend sinalizar tabela, chamar /api/v1/n8n-agent/send-price-table
```

## Contrato de entrada da UAZAPI

O payload usado no fluxo Vespa traz estes campos principais:

```text
body.instanceName
body.chat.wa_chatid
body.chat.wa_name
body.message.id
body.message.content
body.message.messageType
body.message.fromMe
body.message.chatid
body.message.text
```

No node `DADOS1` da Vespa, esses campos viram:

| Campo normalizado | Origem |
|---|---|
| `instance` | `body.instanceName` |
| `remoteJid` | `body.chat.wa_chatid` |
| `id` | `body.message.id` |
| `conversation` | `body.message.content` |
| `messageType` | `body.message.messageType` |
| `pushName` | `body.chat.wa_name` |
| `fromMe` | `body.message.fromMe` |
| `numero_limpo` | `body.message.chatid.split('@')[0]` |

Esses nomes sao importantes porque aparecem depois em Redis, Supabase, memoria e envio UAZAPI.

## Bloco 1: entrada e validacao no n8n

Referencia Vespa:

- `Webhook1`
  - Metodo: `POST`
  - Path: `vespa`
- `DADOS1`
  - Extrai os campos essenciais.
- `If2`
  - Confirma que `instance`, `remoteJid` e `id` existem.
  - Se faltar dado essencial, encerra em `No Operation, do nothing1`.

Na Results atual, o n8n tambem deve:

- responder rapido ao webhook;
- ignorar mensagem enviada pelo proprio numero (`fromMe`);
- aplicar allowlist de teste, se existir;
- nao mandar payload cru da UAZAPI para `/api/v1/webhook/whatsapp` se o n8n ja fez debounce e envio, porque isso duplicaria logica e poderia gerar duplo envio.

## Bloco 2: identificar ou criar contato

Na Vespa:

- `Get a row`
  - Supabase table: `CLIENTES`
  - Filtro: `numero = numero_limpo`
- `If`
  - Se achou registro com mesmo numero, continua.
  - Se nao achou, cria.
- `Create a row`
  - Campos:
    - `nome = pushName`
    - `numero = numero_limpo`
    - `criado_em = now`
- `If1`
  - Se `pausar_ia = Sim`, encerra em `No Operation, do nothing`.

Na Results atual, isso foi movido para o backend:

- Arquivo: `backend/src/crm/leads/contacts.repository.ts`
- Funcao principal: `findOrCreateContact(phone, name)`
- Tabela: `contacts`
- Campos:
  - `phone`
  - `name`
  - `type`: `lead` ou `student`
  - `pausar_ia`: `Sim` ou `Nao`

Regra para outra IA:

> Se o n8n chama `/api/v1/n8n-agent/run`, nao precisa recriar a tabela `CLIENTES` da Vespa. Use o contrato do backend Results, que cria/consulta `contacts`.

## Bloco 3: resolver tipo de mensagem

Referencia Vespa: `Switch1`.

Rotas:

| `messageType` | Caminho |
|---|---|
| `conversation` | usa texto direto |
| `ExtendedTextMessage` | usa texto direto |
| `audioMessage` | baixa midia, converte arquivo, transcreve |
| `imageMessage` | baixa midia, converte arquivo, analisa imagem |

### Texto

Nodes:

- `Set Text Message`
- `Message1`

Saida esperada:

```json
{ "message": "texto final do usuario" }
```

### Audio

Nodes:

- `HTTP Request5`
  - `POST https://...uazapi.com/message/download`
  - Body:
    - `id = body.message.id`
    - `return_base64 = true`
- `Convert to File`
  - Converte `base64Data` para binario `audio/mpeg`.
- `HTTP Request`
  - `POST https://api.groq.com/openai/v1/audio/transcriptions`
  - Modelo: `whisper-large-v3-turbo`
  - `language = pt`
  - `response_format = verbose_json`
- `Set Audio Message`
  - `message = $json.text`

No backend Results, a mesma ideia existe em:

- `backend/src/whatsapp/uazapi/uazapi.download.ts`
- `backend/src/media/audio.transcriber.ts`

### Imagem

Nodes:

- `HTTP Request6`
  - baixa a midia da UAZAPI em base64.
- `Convert to File2`
- `Analyze image`
  - modelo usado na Vespa: `gpt-4o-mini`
  - objetivo: transformar imagem em descricao textual para o agente.
- `Edit Fields2`
  - converte a analise para o campo `message`.

No backend Results, a mesma ideia existe em:

- `backend/src/media/image.analyzer.ts`

## Bloco 4: mensagem humana, bloqueio e memoria

Referencia Vespa:

- `Message1`
  - Padroniza o campo `message`.
- `If3`
  - Testa `fromMe`.

Se `fromMe = true`:

1. `ChaveBlock1`
   - Redis `SET {remoteJid}_block = true`
   - TTL: `3600`
2. `Chat Memory Manager2`
   - Insere a mensagem como `ai` na memoria.

Se `fromMe = false`:

1. `Redis6`
   - Redis `GET {remoteJid}_block`
2. `If4`
   - Se existe block, grava a mensagem como `user` e nao responde.
   - Se nao existe block, segue para debounce.

No backend antigo Results:

- `backend/src/agents/shared/agent.pause.ts`
- `isBlocked(remoteJid)`
- `setBlock(remoteJid)`
- chave Redis: `{remoteJid}_block`

Na rota atual `n8n-agent/run`, o bloqueio principal e `contacts.pausar_ia`.

## Bloco 5: debounce e juncao de mensagens

Objetivo: quando o usuario manda varias mensagens seguidas, esperar alguns segundos e processar tudo como uma mensagem so.

Referencia Vespa:

- `Redis7`
  - `PUSH {remoteJid} <- message`
- `Wait1`
  - espera `45s`
- `Redis8`
  - recupera lista `{remoteJid}`
- `If5`
  - compara a mensagem atual com a ultima da lista.
- `Redis9`
  - se a mensagem atual ainda e a ultima, deleta a lista.
- `Message Final1`
  - junta tudo com `join(" ")`.

Implementacao equivalente no backend:

- Arquivo: `backend/src/agents/shared/agent.message-join.ts`
- Funcao: `joinMessages(remoteJid, message)`
- Variavel: `AGENT_MESSAGE_WAIT_MS`
- Comportamento:
  - `rpush(remoteJid, message)`
  - espera
  - se chegou mensagem mais nova, retorna `null`
  - se e a ultima, deleta a lista e retorna `all.join(' ')`

Na arquitetura Results com n8n na frente, o debounce deve ficar em apenas um lugar. Se o n8n ja juntou mensagens, nao chame tambem o endpoint antigo `/api/v1/webhook/whatsapp`, porque ele tambem tem debounce.

## Bloco 6: chamada do agente

### Vespa original

Node: `AI Agent1`.

Componentes conectados:

- `OpenAI Chat Model`
  - modelo: `gpt-4.1-mini`
  - temperatura: `0.8`
- `Redis Chat Memory`
  - session key: `instance + remoteJid`
  - janela: 15 trocas
- Tools:
  - `Calculator`
  - `data`
  - `pausar_ia`

O prompt da Vespa define a persona May, os servicos da Vespa Auto Center, regras de nao falar preco e quando chamar `pausar_ia`.

### Results atual

Endpoint chamado pelo n8n:

```http
POST /api/v1/n8n-agent/run
Header: x-internal-key: <INTERNAL_API_KEY>
Content-Type: application/json
```

Body:

```json
{
  "message": "mensagem final ja deduplicada",
  "sessionId": "554199999999@s.whatsapp.net",
  "contexto": {
    "senderName": "Nome do contato",
    "chatName": "Nome alternativo",
    "instanceName": "Results"
  }
}
```

Resposta:

```json
{
  "reply": "texto que o n8n deve enviar",
  "sendPriceTable": true,
  "priceTableVariant": "geral",
  "sessionId": "554199999999@s.whatsapp.net",
  "pausarIa": "Sim"
}
```

Se `reply = null`, o n8n nao deve enviar nada.

Arquivo principal:

- `backend/src/integrations/n8n-agent/n8n-agent.routes.ts`

Fluxo interno:

1. Valida `x-internal-key`.
2. Valida body com Zod.
3. Usa `sessionId` como `remoteJid`.
4. Extrai `phone = remoteJid.split('@')[0]`.
5. Busca ou cria contato em `contacts`.
6. Se `pausar_ia = Sim`, classifica se a nova mensagem merece resposta.
7. Chama `runCommercialTurn`.
8. Retorna `reply`, flag de tabela e status de pausa.

## Engine comercial Results

Arquivo principal:

- `backend/src/agents/commercial/commercial.service.ts`

Funcao:

```ts
runCommercialTurn(contact, instance, remoteJid, message, options)
```

Etapas internas:

1. Busca memoria curta no Redis:
   - `getChatHistory(instance, remoteJid)`
2. Busca contexto RAG:
   - `retrieveKnowledgeContext(message, 'commercial')`
3. Monta prompt:
   - `backend/agents/commercial/prompt-v1.md`
   - contexto recuperado da base de conhecimento
   - historico Redis
   - mensagem atual
4. Chama OpenAI chat:
   - modelo: `OPENAI_MODEL_COMMERCIAL`
   - formato de resposta: JSON Schema
5. Valida resposta com `commercialTurnSchema`.
6. Sanitiza texto de saida.
7. Calcula lead score.
8. Persiste conversa no Supabase.
9. Atualiza memoria Redis.
10. Se score atingir handoff, pausa IA e alerta humano.
11. Retorna dados para o n8n.

## Schema obrigatorio da resposta do agente

Arquivo:

- `backend/src/agents/commercial/commercial.schema.ts`

Formato:

```json
{
  "reply": "mensagem ao lead",
  "send_price_table": false,
  "price_table_variant": "geral",
  "collected_data": {
    "interested_course": null,
    "availability": null,
    "objective": null,
    "urgency": null,
    "has_tried_before": null,
    "price_asked": null
  }
}
```

Variantes aceitas de tabela:

- `geral`
- `12_meses`
- `6_meses`
- `sem_fidelizacao`

No prompt atual da Results, a regra operacional diz para usar sempre `geral`, porque existe uma imagem unica com todos os planos.

## RAG e base de conhecimento

Decisao: pgvector no Supabase.

Tabela:

- `knowledge_chunks`

Campos principais:

- `agent_type`: `commercial`, `support` ou `shared`
- `source`
- `heading`
- `content`
- `embedding vector(1536)`
- `metadata`

Fluxo:

```text
docs/prompt/base de conhecimento
  -> chunker
  -> embedding OpenAI text-embedding-3-small
  -> upsert em knowledge_chunks

turno do agente
  -> embedding da mensagem do usuario
  -> RPC match_knowledge_chunks
  -> top-k chunks
  -> injeta no system prompt como CONTEXTO RELEVANTE
```

Arquivos:

- `backend/src/knowledge/knowledge.retrieval.ts`
- `backend/src/knowledge/knowledge.embeddings.ts`
- `backend/src/knowledge/knowledge.repository.ts`
- `database/migrations/20260713000001_knowledge_vector_store.sql`

Regra critica:

> O agente nunca deve inventar preco, desconto, prazo, vaga, plano ou beneficio. Se nao estiver no contexto relevante ou nos arquivos `backend/agents`, deve dizer que vai confirmar.

## Score e handoff

Arquivo:

- `backend/src/agents/commercial/commercial.scoring.ts`

Score:

| Dado coletado | Pontos |
|---|---:|
| Curso/idioma de interesse | 2 |
| Disponibilidade | 2 |
| Objetivo | 2 |
| Urgencia alta | 1 |
| Ja tentou antes | 1 |
| Mais de 3 mensagens | 1 |
| Perguntou preco | 1 |

Limite:

```text
handoff = score >= 7
```

Arquivo do handoff:

- `backend/src/agents/commercial/commercial.handoff.ts`

Quando ocorre handoff:

1. Atualiza `contacts.pausar_ia = Sim`.
2. Se `GI_ALERT_NUMBER` estiver configurado, envia alerta via UAZAPI.
3. O backend retorna `pausarIa = Sim`.
4. O n8n deve parar de responder novas mensagens, exceto se a regra de reativacao permitir um turno pontual.

## Reativacao quando `pausar_ia = Sim`

Arquivo:

- `backend/src/agents/commercial/commercial.reactivation.ts`

Quando o contato esta pausado:

1. O classificador recebe a nova mensagem.
2. Responde internamente `duvida` ou `encerrado`.
3. Se for `encerrado`, backend retorna `reply: null`.
4. Se for `duvida`, o backend responde uma vez com `notifyHandoff: false`.
5. Depois recoloca `pausar_ia = Sim`.

Isso evita que a IA fique reencaminhando o mesmo lead para a equipe repetidamente.

## Envio de resposta

### Vespa original

Nodes:

- `Fracionar`
  - divide `output` por paragrafos usando regex de linha em branco.
- `Split Out`
  - transforma cada paragrafo em item.
- `Loop Over Items`
  - percorre cada item.
- `HTTP Request1`
  - `POST https://...uazapi.com/send/text`
  - Body:
    - `number = remoteJid`
    - `text = paragrafo`
    - `delay = 4000`
- `Wait`
  - aguarda antes do proximo bloco.

### Results atual

O n8n deve enviar o texto retornado pelo backend.

Regra recomendada:

1. Se `reply` for `null`, nao enviar nada.
2. Quebrar `reply` em blocos por paragrafos.
3. Enviar cada bloco para UAZAPI `/send/text`.
4. Usar delay humano entre blocos.
5. Somente depois de todos os blocos enviados, se `sendPriceTable = true`, chamar:

```http
POST /api/v1/n8n-agent/send-price-table
Header: x-internal-key: <INTERNAL_API_KEY>
Content-Type: application/json
```

Body:

```json
{
  "sessionId": "554199999999@s.whatsapp.net",
  "variant": "geral"
}
```

Esse endpoint envia a imagem da tabela pela UAZAPI. A tabela deve ir depois do texto, nunca antes.

## Tool `pausar_ia` no fluxo Vespa

Na Vespa, `pausar_ia` e uma tool de workflow chamada pelo `AI Agent1`.

Subfluxo:

1. `When Executed by Another Workflow`
2. `Code in JavaScript`
   - interpreta a query da tool.
3. `Edit Fields1`
   - estrutura:
     - solicitacao
     - numero
4. `HTTP Request2`
   - envia alerta para grupo interno na UAZAPI.
5. `Update a row`
   - Supabase `CLIENTES`
   - seta `pausar_ia = Sim`.

Na Results atual, a mesma responsabilidade foi implementada em codigo:

- `commercial.scoring.ts`
- `commercial.handoff.ts`
- `contacts.pausar_ia`
- `GI_ALERT_NUMBER`

## Rotina diaria de retomada

Referencia Vespa:

- `Schedule Trigger`
  - dispara as 08:00.
- `Get a row1`
  - busca registros em `CLIENTES` com `pausar_ia = Sim`.
- `Loop Over Items1`
  - percorre os contatos.
- `Update a row1`
  - seta `pausar_ia = Nao`.
- `Wait2`
  - aguarda entre iteracoes.

Na Results, a variavel prevista e:

```env
SCHEDULE_RESUME_HOUR=8
```

Se a retomada ficar no n8n, o equivalente deve atualizar `contacts.pausar_ia` para `Nao`, nao a tabela antiga `CLIENTES`.

## Roteador comercial/suporte

O projeto ja tem o roteador, mas a rota atual do n8n usa somente comercial por decisao registrada em ADR-010, porque M2/suporte ainda nao esta completo.

Arquivos:

- `backend/src/agents/router/agent.router.ts`
- `backend/src/agents/router/intent.classifier.ts`

Regra:

- Se `contact.type = student`, rota para `support`.
- Caso contrario, classifica a intencao:
  - `commercial`
  - `support`
  - `ambiguous`
- Falha ou ambiguidade cai em `commercial`.

Ao recriar o fluxo, nao ative suporte no endpoint do n8n ate existir `agents/support` completo.

## Variaveis de ambiente essenciais

Backend:

```env
OPENAI_API_KEY=
OPENAI_MODEL_COMMERCIAL=gpt-4.1-mini
OPENAI_MODEL_SUPPORT=gpt-4.1-mini
OPENAI_MODEL_ROUTER=gpt-4.1-mini
OPENAI_MAX_TOKENS=1024
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

KNOWLEDGE_MATCH_COUNT=4

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

REDIS_URL=
REDIS_PASSWORD=
AGENT_MESSAGE_WAIT_MS=45000
AGENT_BLOCK_TTL_SECONDS=3600
AGENT_HISTORY_LIMIT=15

UAZAPI_URL=
UAZAPI_TOKEN=
UAZAPI_INSTANCE=
UAZAPI_SEND_DELAY_MS=1500
UAZAPI_WEBHOOK_SECRET=

GROQ_API_KEY=
GROQ_MODEL=whisper-large-v3-turbo

GI_ALERT_NUMBER=
INTERNAL_API_KEY=
TEST_ALLOWED_NUMBERS=

PORT=3000
SCHEDULE_RESUME_HOUR=8
```

n8n:

- Credencial UAZAPI ou headers com `token`.
- Credencial Supabase, se o n8n for consultar banco diretamente.
- Credencial Redis, se o debounce ficar no n8n.
- Credencial Groq, se audio for transcrito no n8n.
- Credencial OpenAI, se imagem for analisada no n8n.
- Header `x-internal-key` para chamar o backend Results.

Nunca versionar tokens reais no fluxo/documentacao. O `Vespa (1).json` contem exemplos sensiveis que devem ser substituidos por credenciais do n8n ou variaveis de ambiente.

## Banco de dados Results

Arquivo:

- `database/schema.sql`

Tabelas principais:

### `contacts`

| Campo | Uso |
|---|---|
| `id` | identificador interno |
| `phone` | numero limpo do WhatsApp |
| `name` | nome do contato |
| `type` | `lead` ou `student` |
| `pausar_ia` | `Sim` ou `Nao` |

### `conversations`

| Campo | Uso |
|---|---|
| `contact_id` | contato associado |
| `agent_type` | `commercial` ou `support` |
| `messages` | historico persistente em JSONB |
| `lead_score` | score 0-10 |
| `collected_data` | dados extraidos pelo agente |
| `stage` | etapa do lead |

### `knowledge_chunks`

Usada para RAG com pgvector.

## Passo a passo para outra IA recriar o fluxo

1. Criar webhook n8n para receber UAZAPI.
2. Extrair `instance`, `remoteJid`, `messageId`, `messageType`, `fromMe`, `pushName`, `numero_limpo` e texto bruto.
3. Validar campos obrigatorios.
4. Ignorar `fromMe` ou, se quiser registrar takeover humano, pausar a IA e salvar a mensagem como contexto.
5. Resolver o tipo da mensagem:
   - texto direto;
   - audio via download UAZAPI + Groq Whisper;
   - imagem via download UAZAPI + OpenAI Vision.
6. Normalizar a saida para `{ message: "..." }`.
7. Aplicar debounce por `remoteJid` no Redis.
8. Quando a mensagem final estiver pronta, chamar:

```http
POST /api/v1/n8n-agent/run
```

9. Enviar no body:

```json
{
  "message": "<mensagem final>",
  "sessionId": "<remoteJid>",
  "contexto": {
    "senderName": "<pushName>",
    "instanceName": "<instance>"
  }
}
```

10. Se `reply = null`, encerrar sem envio.
11. Se `reply` existir, dividir por paragrafos e enviar por UAZAPI `/send/text`.
12. Aguardar delay entre blocos.
13. Depois do ultimo bloco, se `sendPriceTable = true`, chamar `/api/v1/n8n-agent/send-price-table`.
14. Nao enviar tabela antes do texto.
15. Manter `pausar_ia` no Supabase como fonte de verdade do handoff.
16. Manter rotina diaria de retomada, se a operacao quiser liberar contatos pausados automaticamente.

## Armadilhas conhecidas

- Nao misturar o caminho n8n atual com `/api/v1/webhook/whatsapp`; esse endpoint antigo espera payload cru da UAZAPI e tambem envia resposta.
- Nao deixar o n8n chamar um LLM cru sem prompt/RAG/schema, porque isso ignora toda a engine comercial.
- Nao duplicar debounce no n8n e no backend.
- Nao enviar tabela de precos antes da mensagem textual.
- Nao citar valores em texto quando a regra do agente manda enviar imagem da tabela.
- Nao rotear para suporte enquanto M2 nao estiver implementado.
- Nao versionar tokens reais da UAZAPI, Supabase, OpenAI, Groq ou Redis.
- Nao usar a tabela `CLIENTES` da Vespa como se fosse a modelagem Results; no projeto atual as tabelas sao `contacts`, `conversations` e `knowledge_chunks`.

## Checklist de validacao

- Webhook recebe payload real da UAZAPI.
- Campos normalizados batem com `DADOS1`.
- Mensagem de texto simples chega ao backend.
- Audio vira texto antes do backend.
- Imagem vira descricao textual antes do backend.
- Mensagens seguidas sao unificadas.
- `fromMe` nao gera resposta automatica.
- `pausar_ia = Sim` nao envia resposta, salvo reativacao pontual por duvida.
- Backend retorna JSON valido.
- n8n envia cada bloco na ordem correta.
- Tabela de precos so e enviada apos o texto.
- Handoff atualiza `contacts.pausar_ia`.
- Alerta humano e enviado quando `GI_ALERT_NUMBER` estiver configurado.
- Historico aparece em `conversations`.
- Memoria curta aparece no Redis.
- RAG retorna chunks de `knowledge_chunks`.

