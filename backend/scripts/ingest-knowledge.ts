import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestFile } from '../src/knowledge/knowledge.ingest.js';
import { deleteChunksBySource, listChunkSources } from '../src/knowledge/knowledge.repository.js';
import type { KnowledgeAgentType } from '../src/knowledge/knowledge.schema.js';
import { logger } from '../src/shared/logger.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BACKEND_ROOT = resolve(__dirname, '..');

/**
 * Só conteúdo FACTUAL entra na base vetorial — aquilo que faz sentido buscar
 * por pergunta do contato (tabela de preço, material, política, FAQ do app).
 *
 * O que ficou de fora, de propósito:
 * - os `prompt-v1.md`, `shared/persona.md`, `shared/forbidden-phrases.md`,
 *   `shared/school-info.md`, `commercial/objections.md`,
 *   `commercial/handoff-rules.md`, `support/rescheduling-rules.md`,
 *   `support/retention-flow.md` → são REGRA de comportamento e agora vão
 *   inteiros no system prompt (ver `src/agents/shared/agent.prompt.ts`).
 *   Ingerir também duplicaria conteúdo e queimaria o orçamento de chunks que
 *   deveria trazer fato. O prompt sendo indexado era pior ainda: voltava pro
 *   modelo como "CONTEXTO RELEVANTE", poluindo o próprio contexto.
 * - `commercial/scoring-rules.md` → documenta o scoring feito em código, não
 *   serve pra responder lead.
 * - `support/faq.md` → é fato, mas pequeno e é o assunto mais frequente do
 *   suporte (acesso ao app, senha, prova). Quando dependia da busca e ela não
 *   trazia o chunk, o agente inventava um fluxo de recuperação de senha em vez
 *   de mandar o link real. Foi promovido pro system prompt.
 *
 * Antes esse script varria os diretórios inteiros; a varredura pegava tudo,
 * inclusive os prompts. Se um arquivo novo de fato precisar ser buscável,
 * adicione aqui explicitamente.
 */
const KNOWLEDGE_SOURCES: Array<{ file: string; agentType: KnowledgeAgentType }> = [
  { file: 'agents/commercial/knowledge-base.md', agentType: 'commercial' },
  { file: 'agents/support/knowledge-base.md', agentType: 'support' },
];

async function run() {
  let total = 0;

  for (const { file, agentType } of KNOWLEDGE_SOURCES) {
    const count = await ingestFile(resolve(BACKEND_ROOT, file), file, agentType);
    total += count;
  }

  // Ingestões anteriores varriam os diretórios inteiros — os chunks de prompt e
  // regra continuariam na base e seriam recuperados como contexto. Remove o que
  // não está mais no allowlist.
  const allowed = new Set(KNOWLEDGE_SOURCES.map((s) => s.file));
  const stale = (await listChunkSources()).filter((source) => !allowed.has(source));

  for (const source of stale) {
    await deleteChunksBySource(source);
    logger.info('removed stale knowledge source', { source });
  }

  logger.info('knowledge ingestion complete', {
    totalChunks: total,
    sources: KNOWLEDGE_SOURCES.length,
    staleRemoved: stale.length,
  });
}

run().catch((err) => {
  logger.error('knowledge ingestion failed', { errorMessage: (err as Error).message });
  process.exit(1);
});
