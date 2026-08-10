import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Acha a raiz do backend subindo o diretório até encontrar quem tem
 * `package.json` **e** `agents/` juntos.
 *
 * Path relativo fixo não serve: em dev o código roda de `src/agents/shared/` e
 * em produção de `dist/src/agents/shared/`, então a profundidade até a raiz
 * muda. Qualquer `../../..` acerta um ambiente e quebra o outro — foi
 * exatamente o que aconteceu: o path foi "corrigido" de 4 pra 3 níveis, passou
 * a funcionar local e derrubou o container, porque `readFileSync` acontece no
 * import → o app não sobe → o n8n recebe 502 ao chamar o agente.
 *
 * Checar só a existência de `agents/` não bastaria: `src/agents/` e
 * `dist/src/agents/` (código compilado) casariam antes da raiz de verdade.
 */
function findBackendRoot(startDir: string): string {
  let current = startDir;

  for (;;) {
    if (existsSync(resolve(current, 'package.json')) && existsSync(resolve(current, 'agents'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `não encontrei a raiz do backend (dir com package.json + agents/) subindo de ${startDir}`,
      );
    }
    current = parent;
  }
}

const AGENTS_DIR = resolve(findBackendRoot(__dirname), 'agents');

export interface PromptSection {
  /** Caminho relativo dentro de `agents/`, ex.: `shared/persona.md`. */
  key: string;
  content: string;
}

/** Lê o `.md` versionado em git. Semente do banco e fallback se o Supabase cair. */
export function readBlockFromDisk(key: string): string {
  return readFileSync(resolve(AGENTS_DIR, key), 'utf-8').trim();
}

/**
 * Monta o system prompt juntando os blocos de regra.
 *
 * Por que concatenar em vez de referenciar: os prompts diziam "ver
 * `agents/shared/persona.md`" — ponteiro que o modelo não consegue abrir. Só
 * `prompt-v1.md` era lido de disco; tom de voz, frases proibidas e política de
 * preço/horário chegavam apenas se a busca semântica sorteasse o chunk certo
 * entre os top-k, o que quase nunca acontecia (tom de voz não casa
 * semanticamente com "quanto custa?"). Resultado observado em atendimento
 * real: agente abreviando, repetindo texto e oferecendo horário inexistente
 * apesar da regra estar escrita nos arquivos.
 *
 * Regra de comportamento → sempre no system prompt (aqui).
 * Conteúdo factual (tabela de preço, FAQ) → base vetorial, por busca.
 *
 * Ordem importa: a parte estática vem primeiro e o CONTEXTO RELEVANTE
 * (dinâmico) é anexado depois, mantendo o prefixo estável e cacheável pelo
 * prompt caching da OpenAI.
 *
 * Delimitador é tag, não `---`: a versão anterior separava as seções com
 * `\n\n---\n\n` e comentário HTML, e o modelo copiava isso pra dentro da
 * resposta — o lead recebia uma bolha com `---` sozinho. Tag nomeada delimita
 * igual sem ensinar markdown ao modelo.
 */
export function composeSystemPrompt(sections: readonly PromptSection[]): string {
  return sections
    .map((section) => `<regras fonte="agents/${section.key}">\n${section.content.trim()}\n</regras>`)
    .join('\n\n');
}

/** Composição lendo direto do disco — usada como fallback e pelos testes. */
export function composeSystemPromptFromDisk(keys: readonly string[]): string {
  return composeSystemPrompt(keys.map((key) => ({ key, content: readBlockFromDisk(key) })));
}

/** Anexa o bloco de contexto recuperado da base de conhecimento, se houver. */
export function withKnowledgeContext(
  systemPrompt: string,
  knowledgeContext: string,
  guardrail: string,
): string {
  if (!knowledgeContext) return systemPrompt;
  return `${systemPrompt}\n\nCONTEXTO RELEVANTE (base de conhecimento da Results — ${guardrail}):\n${knowledgeContext}`;
}
