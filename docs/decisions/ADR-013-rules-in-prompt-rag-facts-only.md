# ADR-013 — Regra de comportamento no system prompt, RAG só pra fato

**Data:** 2026-07-24
**Status:** Aceito
**Contexto de origem:** revisão completa do fluxo do agente (M1 + M2)

---

## Contexto

Os prompts dos agentes eram montados lendo **um único arquivo** de disco
(`agents/{commercial,support}/prompt-v1.md`). Todo o resto era referenciado por
texto: "Ver `agents/shared/persona.md`", "Ver `agents/shared/forbidden-phrases.md`",
"Ver `agents/shared/school-info.md`".

O modelo não abre arquivo. Esses ponteiros só chegavam a ele se a busca
semântica (ADR-009) sorteasse o chunk correspondente entre os `top-k = 4` —
ranqueados por similaridade com a **última mensagem do lead**. Regra de tom
("não abreviar", "não quebrar link", "mensagem curta") não casa
semanticamente com "quanto custa?", então praticamente nunca era recuperada.

Consequência observada em atendimento real, e reportada repetidamente pela
DROP mesmo depois de a regra ser escrita nos arquivos:

- agente abreviando ("pra", "Prof.") apesar da regra existir em `persona.md`;
- oferecendo horário de turma que não existe;
- repetindo o mesmo texto e emoji ao mandar a tabela de preços;
- mandando link cortado pro aluno;
- perguntando de novo o que o lead já havia respondido.

Agravantes encontrados na mesma revisão:

1. `scripts/ingest-knowledge.ts` varria os diretórios inteiros de `agents/`, o
   que **indexava o próprio `prompt-v1.md`**. O prompt voltava pro modelo como
   "CONTEXTO RELEVANTE" e consumia parte do orçamento de 4 chunks que deveria
   trazer fato (tabela de preço, FAQ).
2. `match_knowledge_chunks` não tinha piso de similaridade — devolvia sempre 4
   chunks, mesmo quando nenhum respondia à pergunta, diluindo o prompt.
3. Os agentes chamavam a OpenAI **sem `temperature`**, ficando no default 1.0.
   Para um agente de regra rígida isso é aderência instável por construção.

## Decisão

**Separar por natureza do conteúdo:**

| Natureza | Onde vive | Como chega no modelo |
|---|---|---|
| Regra de comportamento (tom, frases proibidas, política de preço/horário, objeções, quando escalar) | `agents/**/*.md` | Concatenado no system prompt, **sempre**, via `composeSystemPrompt()` |
| Fato pequeno, crítico e de alta frequência (link de troca de senha, passo a passo do app Callan, regra de reagendamento) | `agents/support/faq.md`, `agents/support/rescheduling-rules.md` | System prompt também |
| Fato volumoso e consultável (tabela de preço completa, política de material, plano a confirmar) | `agents/**/knowledge-base.md` | Base vetorial, por busca semântica |

O critério pra promover fato ao prompt: **o que acontece se a busca falhar?**
Se a resposta é "o agente inventa", o fato vai pro prompt. Foi o caso do
`faq.md`: dependendo da busca, o agente descrevia um fluxo de "Esqueci minha
senha" que não existe em vez de mandar
`https://casa.callanonline.com/password-change-request`. Se a resposta é "o
agente diz que vai confirmar com a equipe", pode ficar na busca — é o caso da
tabela de preço, que além de tudo nunca é falada em texto (vai como imagem).

Implementação:

- `backend/src/agents/shared/agent.prompt.ts` — `composeSystemPrompt(sources)`
  concatena os arquivos em ordem, marcando cada trecho com
  `<!-- fonte: agents/... -->`. As referências "Ver `agents/...`" nos prompts
  continuam válidas, mas agora apontam pra uma seção do próprio prompt (há uma
  nota no topo de cada `prompt-v1.md` explicando isso ao modelo).
- Comercial recebe: `commercial/prompt-v1.md`, `shared/persona.md`,
  `shared/forbidden-phrases.md`, `shared/school-info.md`,
  `commercial/objections.md`, `commercial/handoff-rules.md`.
- Suporte recebe: `support/prompt-v1.md`, `shared/persona.md`,
  `shared/forbidden-phrases.md`, `shared/school-info.md`,
  `support/rescheduling-rules.md`, `support/retention-flow.md`.
- `scripts/ingest-knowledge.ts` passa a ter **allowlist explícita** de fontes
  factuais, e apaga da base os chunks de fontes que saíram do allowlist
  (senão os chunks de prompt/regra da ingestão anterior continuariam sendo
  recuperados).
- `KNOWLEDGE_MIN_SIMILARITY` (default `0.3`) descarta chunk irrelevante.
- `AGENT_TEMPERATURE` (default `0.4`) passa a ser explícita nos dois agentes.

Ordem do prompt: parte estática primeiro, `CONTEXTO RELEVANTE` (dinâmico) no
fim — mantém o prefixo estável e aproveitável pelo prompt caching da OpenAI.

## Consequências

**Positivas**
- Regra de comportamento deixa de ser probabilística: está em 100% dos turnos.
- Editar `persona.md` / `forbidden-phrases.md` passa a ter efeito real e
  imediato (antes exigia reingestão **e** sorte na busca).
- Base vetorial volta a servir ao propósito dela: fato que muda com frequência
  e não caberia no prompt.
- Contexto irrelevante deixa de entrar.

**Custos e riscos**
- System prompt do comercial vai a ~8,5k tokens (suporte ~4,3k). A ~$0,40/1M
  de input no `gpt-4.1-mini`, ≈ US$ 0,003/turno, e menos com cache. Aceitável.
- Prompt grande pode diluir atenção: se aparecer regra sendo ignorada, o
  caminho é **encurtar e priorizar** os arquivos de regra, não voltar a
  referenciá-los por ponteiro.
- Arquivo de regra novo precisa ser adicionado à lista em
  `commercial.service.ts` / `support.service.ts` — não é mais automático por
  varredura de diretório. Trade-off consciente: explícito > implícito.

## Alternativas descartadas

- **Aumentar `KNOWLEDGE_MATCH_COUNT`**: mais chunks aleatórios não garantem que
  a regra de tom apareça, e pioram a diluição.
- **Injetar regra como mensagem de usuário a cada turno**: mesmo custo, pior
  semântica, e quebra o cache do prefixo.
- **Fine-tuning da persona**: caro, lento pra iterar; a Results ainda ajusta
  tom e política toda semana.
