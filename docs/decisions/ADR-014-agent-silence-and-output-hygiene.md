# ADR-014: Fim do silêncio permanente do agente + higiene de saída

## Status
**Aceito** — 2026-07-25

## Contexto

Três sintomas relatados em produção, todos reproduzíveis no código:

1. **"O agente para e não responde mais, do nada."**
2. **"Manda emoji toda hora."**
3. **"Manda coisas estranhas, tipo `---`."**

### 1. Silêncio — cinco causas independentes

| # | Onde | Causa |
|---|---|---|
| a | `agent.handoff.ts` | `notifyGi` gravava `pausar_ia='Sim'` **incondicionalmente**. Não existe rotina de resume implementada (`SCHEDULE_RESUME_HOUR` está no `env.ts` desde o início e nunca foi usada em lugar nenhum) → pausa era permanente até alguém editar o Supabase à mão. O ADR-007 previa reset às 08:00; nunca foi construído. |
| b | `commercial.service.ts` | `turnFailed` (timeout/429 da OpenAI, JSON inválido, Zod) entrava no `handoff` → **uma falha transitória pausava o contato pra sempre**. |
| c | `commercial.scoring.ts` | `shouldHandoff` com score ≥ 9 pausava também. Score 9 é atingível só qualificando (idioma 2 + disponibilidade 2 + objetivo 2 + urgência 1 + tentativa anterior 1 + >3 mensagens 1) — o lead não pediu nada e a IA saía de cena no meio do fluxo. |
| d | `agent.reactivation.ts` | Enquanto pausado, o único caminho de volta era `shouldReactivate`, que era **fail-closed**: erro, timeout ou resposta inesperada do classificador = continua calado. |
| e | `uazapi.webhook.ts` | Qualquer `fromMe` chamava `setBlock` (1 h). Toda mensagem que o backend envia pela UAZAPI volta no webhook como `fromMe: true` — **a IA se auto-bloqueava depois de responder**. O `Vespa.json` (fluxo de referência) mostra que o payload traz `wasSentByApi`, que separa eco de API de digitação humana. |

Somando: alertar a Gi e calar a IA eram a mesma operação, e três gatilhos
diferentes (heurística de score, erro técnico, eco da própria mensagem)
levavam a silêncio sem intervenção humana nenhuma.

Agravantes no mesmo caminho: `notifyGi` era chamado com `await` **fora** do
`try` do turno — falha no alerta (Supabase ou UAZAPI) derrubava a requisição
inteira e o lead não recebia a resposta que já estava gerada. Áudio/imagem
(`resolveMessageText`) também não tinha `try/catch`: sem `GROQ_API_KEY` ou com
download falhando, o webhook devolvia 500 e o lead ficava sem resposta.

### 2 e 3. Emoji e markdown na mensagem

- `agent.prompt.ts` juntava as seções do system prompt com `\n\n---\n\n` +
  `<!-- fonte: agents/... -->`, e o `prompt-v1.md` **explicava esse formato pro
  modelo**. Resultado: o modelo reproduzia markdown no `reply`, e
  `fractureMessage` transformava a linha `---` numa bolha própria — o lead
  recebia uma mensagem contendo só `---`.
- Os exemplos de resposta dentro do prompt terminavam em 😊 (5 em
  `prompt-v1.md`, 5 em `persona.md`, 1 em `objections.md`). A regra escrita
  ("emoji com moderação") não vence exemplo: few-shot ensinando emoji em toda
  bolha ganha da instrução.
- `sanitizeOutgoingText` só desfazia `\n` literal — nenhuma limpeza de
  markdown, nenhum limite de emoji.

## Decisão

### Silêncio: separar "avisar a Gi" de "calar a IA"

`decideHandoff(score, data, turnFailed)` (`commercial.scoring.ts`) devolve
`{ handoff, pauseAi, reason }`.

**Regra de pausa no comercial (definida pelo usuário em 2026-07-25): a IA para
de responder por 1 dia somente quando as duas condições valem juntas —**

1. **lead qualificado** — `isQualifiedLead`: `interested_course` **e**
   `objective` coletados (mesmo gate que libera a tabela de preço; score não
   entra, porque score sobe por sinal lateral como "mais de 3 mensagens"); e
2. **aceitação explícita de falar com uma pessoa** — `acceptedConsultant`:
   `accepted_consultant=true` (disse sim ao convite) ou `needs_human=true`
   (pediu humano por conta própria).

`wants_to_schedule` **ficou fora da aceitação** (decisão do usuário depois de
ver a simulação): o modelo marca esse campo com sinal implícito — bastou o lead
responder "de manhã seria melhor pra mim" pra virar `true` —, e sinal implícito
não pode calar a IA. Topar a experimental continua avisando a Gi na hora, já que
só ela confirma horário real.

| Gatilho | Avisa a Gi | Pausa a IA | Por quê |
|---|---|---|---|
| qualificado **+** aceitação explícita | sim | **sim (1 dia)** | a conversa passou a ser da pessoa |
| aceitação explícita, ainda não qualificado | sim | não | IA segue fechando idioma/objetivo em vez de entregar lead cru |
| `wants_to_schedule` | sim | não | sinal implícito; só a Gi confirma horário |
| score ≥ 9 | sim | não | heurística de temperatura, não pedido do lead |
| falha técnica | sim | não | o próximo turno pode funcionar |
| nada disso | não | não | — |

Alerta que não pausa ganha teto de repetição por tipo (`decision.alertKind` →
`claimHandoffAlert`): lead quente 1×/dia, agendamento/aceitação/falha 1×/hora.
Sem isso o alerta repetiria a cada mensagem, porque os campos que o disparam
ficam `true` pro resto da conversa (era `pausar_ia` que segurava o segundo
alerta — risco previsto no ADR-011).

No suporte (M2) a escalação é sempre pedido real de uma pessoa
(reagendamento, cancelamento, reclamação) — lá o handoff continua pausando,
com o mesmo prazo de 1 dia; só falha técnica não pausa.

Complementos:

- `notifyGi(..., { pauseAi })` — pausa passou a ser opt-out explícito.
- `claimHandoffAlert(contactId, kind)` (Redis `SET NX`) — teto de repetição por
  tipo de alerta, detalhado na tabela acima.
- `pausar_ia` expira: `AGENT_PAUSE_MAX_HOURS` (default **24 h = 1 dia**),
  prazo **absoluto** contado do handoff. `markPauseStart` grava o instante em
  Redis (`pause_until:<contactId>`, TTL prazo + 7 dias) e `isPauseExpired` usa
  esse carimbo; `/api/v1/n8n-agent/run` destrava e a IA reassume. Sem o
  carimbo (contato pausado à mão no CRM, ou pausado antes desta versão) o
  fallback é `contacts.updated_at` — aproximado, porque o trigger bumpa em
  qualquer update, mas erra pro lado de responder. Carimbo em Redis em vez de
  coluna nova justamente pra não exigir migration; o prazo tinha que ser
  absoluto porque `updated_at` desliza a cada dúvida respondida durante a
  pausa (snap-back do ADR-011) e o contato nunca destravaria.
- `shouldReactivate` virou **fail-open**: só cala com sinal claro de
  encerramento (lista de agradecimento/confirmação, decidida sem chamar
  modelo). Erro, timeout ou resposta inesperada → responde. Silêncio não é
  "padrão seguro": pro contato é a escola ignorando ele.
- `completeStructuredTurn` (`agent.completion.ts`): retentativa
  (`AGENT_COMPLETION_ATTEMPTS`, default 2) cobrindo erro de API, JSON inválido,
  `finish_reason=length` (JSON truncado, com nudge pedindo resposta mais curta)
  e repetição literal da última resposta (nudge pedindo reformulação). Só
  depois de esgotar as tentativas cai no fallback.
- Alerta pra Gi agora é `try/catch` — nunca derruba um turno cuja resposta já
  está pronta.
- `uazapi.webhook.ts`: eco de API (`wasSentByApi`) é ignorado em vez de
  bloquear; `fromMe` sem esse campo continua tratado como atendimento humano
  (lado seguro). Mais: dedupe por `message.id` (`agent.dedupe.ts`), grupo
  ignorado, ACK imediato com processamento em background (a espera de
  `AGENT_MESSAGE_WAIT_MS` estourava o timeout do webhook e a UAZAPI reentregava
  o evento), falha de mídia responde pedindo texto, e o histórico passou a
  entrar no `routeAgent` (a chamada ignorava o parâmetro).
- `joinMessages` desempata por `message.id`, não por texto — duas mensagens
  iguais ("oi" e "oi") se achavam, as duas, a última da fila e as duas
  respondiam. Chave ganhou namespace (`join:`) e TTL.

### Saída: markdown e emoji cortados de forma determinística

- `agent.prompt.ts` delimita seções com `<regras fonte="...">` em vez de
  `---` + comentário HTML.
- `sanitizeOutgoingText` remove linha de separador, `#`, `**`, crase,
  comentário HTML e marcador de lista; converte `**x**` → `*x*` (negrito do
  WhatsApp) e `[t](url)` → `t: url`; e corta emoji além de `AGENT_MAX_EMOJIS`
  (default 1) **por resposta**, não por bolha.
- `fractureMessage` quebra em qualquer linha (seguro pra URL, que nunca contém
  quebra de linha), descarta fragmento que é só separador/pontuação, gruda
  fragmento minúsculo no anterior e funde o excedente acima de
  `AGENT_MAX_BUBBLES`.
- Prompts: emoji removido de todos os exemplos; regra de emoji passou a ser
  numérica ("no máximo 1 por resposta, normalmente zero"); seção "Formato de
  saída" (M1 e M2) e `forbidden-phrases.md` proíbem markdown explicitamente.

### Tabela de preço: mesmo padrão (regra no prompt + trava no código)

O eval expôs uma terceira falha, não relatada mas do mesmo tipo: o agente
mandava a tabela de preço sem o lead ter pedido preço (atropelando a etapa de
conexão), e às vezes deixava de mandar quando o lead pediu e já tinha dito tudo.
O passo 4 do `prompt-v1.md` tinha **duas formulações competindo** do mesmo gate
— foi reescrito como algoritmo de 4 linhas, com o falso positivo mais comum
explicitado ("dizer que prefere particular ou turma NÃO é pedir preço"). Isso
levou a aderência de 0/3 pra 2/3 rodadas; a garantia é `canSendPriceTable`:
`send_price_table=true` do modelo só vale se `price_asked === true` no
acumulado da conversa.

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| Implementar o job de resume das 08:00 (ADR-007) | Resolve só o caso (a) e ainda deixa o contato mudo por horas. A causa real é pausar por gatilho que não é pedido humano. |
| Migration com `pausar_ia_until timestamptz` | Mais correto que usar `updated_at`, mas exige rodar migration em produção pra corrigir um bug ativo. Fica registrado como melhoria; `updated_at` erra pro lado de responder. |
| Só reforçar a regra de emoji/markdown no prompt | Já havia regra escrita ("emoji com moderação", "nunca texto solto fora do schema") e o modelo furava. Regra sem corte determinístico não é garantia. |
| Manter `shouldReactivate` fail-closed | Silêncio por falha de classificador é o pior resultado possível: o contato não sabe que existe uma pausa, só vê a escola parar de responder. |

## Consequências

- **A IA passa a continuar na conversa depois de lead quente** (e de qualquer
  handoff que não seja "qualificado + aceitou consultor"). Se a Gi assumir pelo
  WhatsApp no caminho do n8n, não há `fromMe` chegando ao backend (o filtro é
  no n8n) → risco de IA e Gi responderem em paralelo. Mitigação disponível
  hoje: `pausar_ia` manual no CRM. Fechar isso de vez pede o n8n repassando
  evento `fromMe`/`wasSentByApi` pro backend — próxima sessão.
- `collected_data` ganha `accepted_consultant` (booleano com trava, igual
  `price_asked`/`wants_to_schedule`/`needs_human`). O campo é novo no
  `json_schema` do turno comercial: conversa antiga em `conversations` não tem
  a chave, e `mergeCollectedData` trata ausência como `null` sem quebrar.
- `AgentTurnResult`/`SupportTurnResult` ganham `pauseAi`; o endpoint do n8n
  passou a derivar `pausarIa` de `pauseAi` (não mais de `handoff`).
- Webhook legado responde `202`-equivalente (`{status:'accepted'}`) antes de
  processar — quem consome o corpo pra saber `leadScore` não recebe mais esse
  dado nessa rota (o caminho de produção é o `/api/v1/n8n-agent/run`).
- Custo: até 2 chamadas por turno no pior caso (retentativa). Na prática só
  quando o turno falharia de qualquer forma.
- Vars novas: `AGENT_COMPLETION_ATTEMPTS`, `AGENT_MAX_EMOJIS`,
  `AGENT_MAX_BUBBLES`, `AGENT_PAUSE_MAX_HOURS`.
- O fracionamento em produção é feito pelo Code node do n8n (ADR-010), não por
  `fractureMessage` — mas o `reply` já sai sanitizado do backend, então `---` e
  emoji excedente não chegam nem no n8n. Pra bater com a nova saída, o split do
  n8n deve ser **por quebra de linha**, não só por linha em branco.
