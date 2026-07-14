import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestFile } from '../src/knowledge/knowledge.ingest.js';
import type { KnowledgeAgentType } from '../src/knowledge/knowledge.schema.js';
import { logger } from '../src/shared/logger.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BACKEND_ROOT = resolve(__dirname, '..');

const AGENT_DIRS: Array<{ dir: string; agentType: KnowledgeAgentType }> = [
  { dir: join(BACKEND_ROOT, 'agents/commercial'), agentType: 'commercial' },
  { dir: join(BACKEND_ROOT, 'agents/support'), agentType: 'support' },
  { dir: join(BACKEND_ROOT, 'agents/shared'), agentType: 'shared' },
];

async function run() {
  let total = 0;

  for (const { dir, agentType } of AGENT_DIRS) {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      logger.warn('agent knowledge dir missing, skipping', { dir });
      continue;
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'));
    if (mdFiles.length === 0) {
      logger.warn('no .md files found, skipping', { dir });
      continue;
    }

    for (const file of mdFiles) {
      const filePath = join(dir, file);
      const source = relative(BACKEND_ROOT, filePath).replace(/\\/g, '/');
      const count = await ingestFile(filePath, source, agentType);
      total += count;
    }
  }

  logger.info('knowledge ingestion complete', { totalChunks: total });
}

run().catch((err) => {
  logger.error('knowledge ingestion failed', { errorMessage: (err as Error).message });
  process.exit(1);
});
