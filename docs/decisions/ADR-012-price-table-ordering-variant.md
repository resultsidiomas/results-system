# ADR-012: Ordem texto→tabela e tabela por variante de plano

## Status
**Aceito** — 2026-07-15

## Contexto

Usuário reportou execução real confusa: o agente perguntou sobre valores,
a **imagem da tabela chegou primeiro**, e só depois veio o texto "vou te
mandar a tabela". Causa raiz: `commercial.service.ts` mandava a imagem
**de forma síncrona, dentro do processamento do turno** (antes de devolver
a resposta HTTP pro n8n), enquanto o **texto** só saía depois, através do
loop de fracionamento do n8n (com delay proposital de 3000-5500ms por
bloco). A imagem sempre vencia a corrida.

Também: `getPriceTableImages()` mandava as **4 imagens sempre juntas**
(overview geral + os 3 planos individuais, que são visualmente redundantes
entre si) — pedido do usuário foi mandar só a tabela adequada ao que o
lead está buscando.

## Decisão

### Ordem garantida (não por timing, por fila)

`commercial.service.ts` não manda mais imagem nenhuma — só sinaliza
`sendPriceTable`/`priceTableVariant` no retorno. Quem decide **quando**
entregar é o consumidor:

- `uazapi.webhook.ts` (caminho antigo, sem tráfego real hoje): manda o
  texto (`sendFractured`) e só depois, se `sendPriceTable`, a imagem.
- `n8n-agent.routes.ts` (caminho real): o Code node `Quebrar Resposta em
  Blocos` monta **uma fila única** de itens — todos os blocos de texto
  primeiro, e a tabela de preços (se houver) como **último item da
  mesma fila**, marcado `kind:'price_table'`. O `Loop Blocos` processa
  essa fila item por item, sempre na ordem — a tabela só é processada
  depois de todos os textos, porque é literalmente o último item, não uma
  corrida entre dois branches paralelos.
- Dentro do loop, o IF `Bloco É Texto?` decide: `kind==='text'` → HTTP
  direto pra UAZAPI (como antes); `kind==='price_table'` → chama o novo
  endpoint `POST /api/v1/n8n-agent/send-price-table` (mesma auth interna
  do "Chamar Agente"), que manda a imagem certa via UAZAPI usando as
  credenciais do backend.

### Tabela por variante, não as 4 juntas

`price-table.assets.ts`: `getPriceTableImages()` (plural, mandava as 4)
virou `getPriceTableImage(variant)` (singular). Mapeamento:

| Variante | Imagem | Quando |
|---|---|---|
| `geral` (padrão) | tabela-01 | plano ainda não mencionado pelo lead — imagem já mostra os 3 planos juntos |
| `12_meses` | tabela-04 | lead mencionou plano anual/12 meses |
| `6_meses` | tabela-03 | lead mencionou 6 meses |
| `sem_fidelizacao` | tabela-02 | lead mencionou mensal/sem compromisso |

`commercial.schema.ts` ganhou `price_table_variant` (enum, sempre
presente no output estruturado) — o modelo escolhe com base no que o lead
já falou sobre duração de plano; ver `prompt-v1.md` passo 4.

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| Manter envio síncrono no backend, só adicionar um `sleep` antes de mandar a imagem | Corrida baseada em tempo estimado — frágil, quebra de novo se o delay do texto mudar. |
| Enviar a imagem em paralelo a partir de "IA Decidiu Responder?" (branch separado) | Ainda é uma corrida entre dois branches concorrentes do n8n, sem garantia de ordem. |
| Detectar variante por regra de código (keyword matching) em vez do modelo escolher | Modelo já lê a conversa inteira pra decidir isso mesmo (mesmo padrão de `collected_data`) — mais simples reaproveitar o structured output existente. |

## Consequências

- `RunCommercialTurnOptions.sendImages` removido (não faz mais sentido — a
  função nunca envia imagem sozinha).
- `AgentTurnResult` ganha `priceTableVariant`.
- Novo endpoint `POST /api/v1/n8n-agent/send-price-table` (auth
  `x-internal-key`, mesma do endpoint principal).
- Workflow n8n: `Quebrar Resposta em Blocos` agora emite uma fila
  heterogênea (`kind: 'text' | 'price_table'`) em vez de só strings; novo
  node `Bloco É Texto?` (IF) e `Enviar Tabela de Preços` (HTTP).
