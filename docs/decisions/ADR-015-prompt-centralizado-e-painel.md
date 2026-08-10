# ADR-015 — Prompt centralizado no banco, painel humano e correções de comportamento

**Data:** 2026-08-10
**Status:** Aceito
**Supersede parcialmente:** ADR-013 (composição do prompt), ADR-014 (política de emoji e pausa em `wants_to_schedule`)

---

## Contexto

Três problemas chegaram juntos, a partir da revisão de uma conversa real com o
agente (documento "Conversa Edu 2", 06/08/2026):

1. **Não havia um lugar único para o humano controlar a instrução do agente.**
   A regra vivia em 13 arquivos `.md` em `backend/agents/` e a ordem de
   composição estava hardcoded dentro de `commercial.service.ts` e
   `support.service.ts`. Qualquer ajuste de texto exigia commit e deploy, e não
   existia uma visão de "o que o agente lê".

2. **O agente continuava errando em três comportamentos já proibidos por
   escrito:** emoji demais, travessão nas respostas e condução do agendamento
   da aula experimental por conta própria.

3. **Não havia como a equipe testar o agente sem usar o WhatsApp real.**

O diagnóstico do item 2 mudou o desenho da solução. Dos três erros, dois tinham
causa no próprio prompt:

- **Travessão:** a proibição existia em `persona.md` e `forbidden-phrases.md`,
  mas os *exemplos de fala* dentro de `commercial/prompt-v1.md` eram escritos
  com travessão (`"Perfeito, particular então — vou te mandar a tabela"`). O
  prompt ensinava, por imitação, exatamente o que proibia por instrução. E não
  havia corte determinístico no sanitizer, ao contrário do que já existia para
  markdown e emoji.
- **Emoji:** `AGENT_MAX_EMOJIS` limitava **por resposta**, não por posição na
  conversa. Um emoji em toda resposta é permitido por essa regra, e é
  exatamente o efeito observado.
- **Agendamento:** `decideHandoff` devolvia `pauseAi: false` para
  `wants_to_schedule` (decisão de 2026-07-25), então a IA seguia conduzindo e
  acabava oferecendo dia e hora que não existem — não há integração de
  calendário.

## Decisão

### 1. Fonte de verdade do prompt vai para o Supabase

Tabelas `agent_prompt_blocks` (conteúdo), `agent_prompt_composition` (ordem por
agente) e `agent_prompt_versions` (histórico). Os `.md` do git viram semente
(`npm run seed:prompts`) e **fallback**: se o Supabase falhar ou um bloco
estiver ausente, o backend monta o prompt a partir do arquivo versionado em vez
de responder sem a regra.

Alternativa descartada: manter em arquivo e o painel editar o disco. O backend
roda em container no EasyPanel — a edição sumiria no próximo deploy.

Cache de 30 segundos por agente. Sem invalidação distribuída de propósito: pode
haver mais de um container, e o TTL resolve os dois casos com uma peça a menos.

A ordem de composição também virou dado (`agent_prompt_composition`), mas
continua com um espelho em código (`agent.prompt.manifest.ts`) que descreve o
que cada bloco é — o manifesto é a semente e a documentação; o banco é o que
vale em runtime.

### 2. Emoji por posição na conversa, não por resposta

`emojiBudget()` libera emoji só na primeira mensagem do atendimento (histórico
sem nenhuma mensagem do agente) e na última (o turno que pausa a IA e entrega
para uma pessoa). Nos demais turnos o orçamento é zero e o corte acontece no
sanitizer.

"Última mensagem" precisou de uma definição operacional: o modelo não conhece o
futuro da conversa. O sinal usado é o momento em que a IA sai de cena, que é o
único ponto verificável em que a mensagem é, de fato, a última.

### 3. Travessão cortado no sanitizer, e exemplos do prompt reescritos

`stripEmDash()` converte travessão do meio da frase em vírgula e remove o de
início de linha. Os dois exemplos de fala com travessão em
`commercial/prompt-v1.md` foram reescritos, e `persona.md` passou a dizer
explicitamente que as instruções usam travessão por serem documento interno e
que isso não é modelo de fala.

### 4. Aceitar a aula experimental pausa a IA

`decideHandoff` passa a devolver `pauseAi: true` para `wants_to_schedule`,
revertendo a decisão de 2026-07-25. O contato vai para o mesmo destino do lead
qualificado (`GI_ALERT_NUMBER`).

**Risco assumido e como foi contido:** a decisão de julho existia por um motivo
real — o modelo marcava `wants_to_schedule` com sinal implícito (bastou o lead
dizer "de manhã seria melhor pra mim"), e com pausa isso emudeceria a IA no
meio da qualificação. A contenção está no prompt: o passo 5 e a definição do
campo em `collected_data` agora exigem aceitação explícita e listam o que **não**
conta (preferência de turno, interesse genérico). Se o falso positivo voltar, o
ajuste é no texto do campo, não na regra de pausa.

### 5. Painel interno com Auth do Supabase

`frontend/` em React + Vite. Login por e-mail e senha do Supabase Auth, sem
cadastro aberto (contas criadas manualmente). O backend valida o token com a
chave anônima em `admin.auth.ts` — a service role key nunca sai do servidor.

Área de testes roda a conversa de verdade. Com `N8N_TEST_WEBHOOK_URL`
configurada, a mensagem entra pelo fluxo real do n8n e só o envio pela UAZAPI é
desviado; sem ela, roda a engine direto no backend. O painel sempre mostra qual
caminho respondeu — um teste que parece mais real do que foi é pior do que não
testar. Contrato do desvio em `docs/CONSOLE-TESTE-N8N.md`.

## Consequências

**Positivas**
- Edição de regra sem deploy, com histórico e rollback.
- Os três erros observados passam a ter corte determinístico, não só instrução.
- A equipe testa o agente sem tocar no WhatsApp.

**Negativas / a acompanhar**
- Mais uma dependência no caminho crítico da resposta (mitigada pelo fallback
  em disco e pelo cache).
- Os `.md` do git podem divergir do banco depois da primeira edição no painel.
  `seed:prompts` preserva o conteúdo do banco por padrão justamente por isso;
  `--force` desfaz edições e existe para reset consciente.
- A pausa em `wants_to_schedule` depende da disciplina do modelo em marcar o
  campo só com aceitação explícita. Precisa ser observado nas próximas
  conversas reais.
- Sem rotina de resume, o contato pausado volta sozinho depois de
  `AGENT_PAUSE_MAX_HOURS` (24h) — mesma limitação já registrada no ADR-014,
  agora atingindo mais conversas, porque mais situações pausam.
