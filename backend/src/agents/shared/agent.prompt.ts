import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const AGENTS_DIR = resolve(__dirname, '../../../agents');

/**
 * Monta o system prompt juntando os arquivos de regra de `agents/`.
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
 */
export function composeSystemPrompt(sources: readonly string[]): string {
  return sources
    .map((source) => {
      const content = readFileSync(resolve(AGENTS_DIR, source), 'utf-8').trim();
      return `<!-- fonte: agents/${source} -->\n${content}`;
    })
    .join('\n\n---\n\n');
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
