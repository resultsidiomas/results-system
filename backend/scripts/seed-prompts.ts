import { supabase } from '../src/config/supabase.js';
import { logger } from '../src/shared/logger.js';
import {
  PROMPT_BLOCKS,
  PROMPT_COMPOSITION,
  type AgentType,
} from '../src/agents/shared/agent.prompt.manifest.js';
import { readBlockFromDisk } from '../src/agents/shared/agent.prompt.js';

/**
 * Semeia `agent_prompt_blocks` e `agent_prompt_composition` a partir dos `.md`
 * versionados em git.
 *
 * Rodar uma vez depois da migration. Rodar de novo é seguro para a
 * composição (idempotente), mas **não sobrescreve conteúdo já editado** por
 * padrão: depois que alguém ajustou uma regra pelo painel, o `.md` do git está
 * desatualizado e reimportá-lo desfaria a edição sem aviso. Para forçar a
 * volta ao conteúdo do git (descartando as edições do painel), use `--force`.
 */
const FORCE = process.argv.includes('--force');

async function seedBlocks(): Promise<void> {
  for (const block of PROMPT_BLOCKS) {
    const content = readBlockFromDisk(block.key);

    const { data: existing, error: readError } = await supabase
      .from('agent_prompt_blocks')
      .select('block_key, version')
      .eq('block_key', block.key)
      .maybeSingle();

    if (readError) throw new Error(`falha lendo ${block.key}: ${readError.message}`);

    if (existing && !FORCE) {
      // Metadado (título/categoria/escopo) vem do manifesto e pode ser
      // atualizado sem risco; o conteúdo é do humano e fica intocado.
      const { error } = await supabase
        .from('agent_prompt_blocks')
        .update({ title: block.title, agent_scope: block.scope, category: block.category })
        .eq('block_key', block.key);

      if (error) throw new Error(`falha atualizando metadado de ${block.key}: ${error.message}`);

      logger.info('prompt block preservado (já existe no banco)', { blockKey: block.key });
      continue;
    }

    const { error } = await supabase.from('agent_prompt_blocks').upsert(
      {
        block_key: block.key,
        title: block.title,
        agent_scope: block.scope,
        category: block.category,
        content,
        updated_by: 'seed',
      },
      { onConflict: 'block_key' },
    );

    if (error) throw new Error(`falha semeando ${block.key}: ${error.message}`);

    logger.info(existing ? 'prompt block sobrescrito (--force)' : 'prompt block criado', {
      blockKey: block.key,
    });
  }
}

async function seedComposition(): Promise<void> {
  for (const agentType of Object.keys(PROMPT_COMPOSITION) as AgentType[]) {
    const keys = PROMPT_COMPOSITION[agentType];

    // Apaga antes de inserir: a ordem é posicional e um bloco removido do
    // manifesto tem que sumir da composição, senão continuaria no prompt.
    const { error: deleteError } = await supabase
      .from('agent_prompt_composition')
      .delete()
      .eq('agent_type', agentType);

    if (deleteError) throw new Error(`falha limpando composição ${agentType}: ${deleteError.message}`);

    const rows = keys.map((blockKey, index) => ({
      agent_type: agentType,
      block_key: blockKey,
      position: (index + 1) * 10,
      is_active: true,
    }));

    const { error } = await supabase.from('agent_prompt_composition').insert(rows);
    if (error) throw new Error(`falha semeando composição ${agentType}: ${error.message}`);

    logger.info('composição semeada', { agentType, blocks: keys.length });
  }
}

async function main(): Promise<void> {
  logger.info('seed de prompts iniciado', { force: FORCE });
  await seedBlocks();
  await seedComposition();
  logger.info('seed de prompts concluído');
}

main().catch((err) => {
  logger.error('seed de prompts falhou', { errorMessage: (err as Error).message });
  process.exit(1);
});
