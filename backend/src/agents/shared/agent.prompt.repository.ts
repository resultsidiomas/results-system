import { supabase } from '../../config/supabase.js';
import { logger } from '../../shared/logger.js';
import {
  PROMPT_BLOCKS,
  PROMPT_COMPOSITION,
  findBlockDefinition,
  type AgentType,
} from './agent.prompt.manifest.js';
import {
  composeSystemPrompt,
  composeSystemPromptFromDisk,
  readBlockFromDisk,
  type PromptSection,
} from './agent.prompt.js';

export interface PromptBlockRow {
  block_key: string;
  title: string;
  agent_scope: string;
  category: string;
  content: string;
  version: number;
  updated_by: string | null;
  updated_at: string;
}

export interface PromptVersionRow {
  version: number;
  content: string;
  updated_by: string | null;
  created_at: string;
}

/**
 * Cache do prompt montado.
 *
 * O prompt é lido a cada turno do agente e é o caminho crítico da resposta ao
 * lead — uma ida ao Supabase por mensagem adiciona latência e mais um ponto de
 * falha. Com TTL curto, a edição feita no painel entra em produção sozinha em
 * até `CACHE_TTL_MS`, sem deploy e sem invalidação distribuída (o backend pode
 * rodar em mais de um container no EasyPanel, então limpar o cache de um deles
 * não limparia o do outro — TTL resolve os dois casos).
 */
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  prompt: string;
  expiresAt: number;
}

const promptCache = new Map<AgentType, CacheEntry>();

/** Chamado depois de uma edição para a mudança valer no turno seguinte, sem esperar o TTL. */
export function invalidatePromptCache(): void {
  promptCache.clear();
}

/**
 * Monta o system prompt do agente a partir do banco.
 *
 * Se o Supabase falhar ou vier vazio (banco novo, migration ainda não rodada),
 * cai nos `.md` versionados em git. O agente nunca pode parar de responder por
 * causa de uma indisponibilidade da tabela de prompt — é preferível responder
 * com a última versão commitada do que não responder.
 */
export async function loadSystemPrompt(agentType: AgentType): Promise<string> {
  const cached = promptCache.get(agentType);
  if (cached && cached.expiresAt > Date.now()) return cached.prompt;

  let prompt: string;

  try {
    prompt = await composeFromDatabase(agentType);
  } catch (err) {
    logger.error('prompt load from database failed, falling back to git files', {
      agentType,
      errorMessage: (err as Error).message,
    });
    prompt = composeSystemPromptFromDisk(PROMPT_COMPOSITION[agentType]);
  }

  promptCache.set(agentType, { prompt, expiresAt: Date.now() + CACHE_TTL_MS });
  return prompt;
}

async function composeFromDatabase(agentType: AgentType): Promise<string> {
  const { data: composition, error: compositionError } = await supabase
    .from('agent_prompt_composition')
    .select('block_key, position')
    .eq('agent_type', agentType)
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (compositionError) throw new Error(compositionError.message);

  if (!composition || composition.length === 0) {
    logger.warn('no prompt composition in database, using git files', { agentType });
    return composeSystemPromptFromDisk(PROMPT_COMPOSITION[agentType]);
  }

  const keys = composition.map((row) => row.block_key as string);

  const { data: blocks, error: blocksError } = await supabase
    .from('agent_prompt_blocks')
    .select('block_key, content')
    .in('block_key', keys);

  if (blocksError) throw new Error(blocksError.message);

  const contentByKey = new Map((blocks ?? []).map((row) => [row.block_key as string, row.content as string]));

  // Bloco declarado na composição mas ausente da tabela de conteúdo cai no
  // arquivo em git em vez de sumir do prompt: um bloco faltando é uma regra de
  // comportamento faltando, e é assim que o agente volta a abreviar, usar
  // travessão ou inventar horário.
  const sections: PromptSection[] = keys.map((key) => {
    const content = contentByKey.get(key);
    if (content !== undefined && content.trim().length > 0) return { key, content };

    logger.warn('prompt block missing in database, using git file', { agentType, blockKey: key });
    return { key, content: readBlockFromDisk(key) };
  });

  return composeSystemPrompt(sections);
}

/** Lista todos os blocos para o painel, com os metadados do manifesto. */
export async function listPromptBlocks(): Promise<
  Array<PromptBlockRow & { description: string; in_prompt: boolean; used_by: AgentType[] }>
> {
  const { data, error } = await supabase
    .from('agent_prompt_blocks')
    .select('block_key, title, agent_scope, category, content, version, updated_by, updated_at')
    .order('category', { ascending: true })
    .order('title', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const definition = findBlockDefinition(row.block_key as string);
    const usedBy = (Object.keys(PROMPT_COMPOSITION) as AgentType[]).filter((agent) =>
      PROMPT_COMPOSITION[agent].includes(row.block_key as string),
    );

    return {
      ...(row as PromptBlockRow),
      description: definition?.description ?? '',
      in_prompt: definition?.inPrompt ?? false,
      used_by: usedBy,
    };
  });
}

export async function getPromptBlock(blockKey: string): Promise<PromptBlockRow | null> {
  const { data, error } = await supabase
    .from('agent_prompt_blocks')
    .select('block_key, title, agent_scope, category, content, version, updated_by, updated_at')
    .eq('block_key', blockKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PromptBlockRow | null) ?? null;
}

/**
 * Grava o conteúdo editado. A versão anterior é arquivada pelo trigger
 * `snapshot_agent_prompt_version` no banco, não aqui — assim o histórico existe
 * mesmo quando alguém edita direto pelo painel do Supabase, fora desta API.
 */
export async function updatePromptBlock(
  blockKey: string,
  content: string,
  updatedBy: string,
): Promise<PromptBlockRow> {
  const { data, error } = await supabase
    .from('agent_prompt_blocks')
    .update({ content, updated_by: updatedBy })
    .eq('block_key', blockKey)
    .select('block_key, title, agent_scope, category, content, version, updated_by, updated_at')
    .single();

  if (error) throw new Error(error.message);

  invalidatePromptCache();
  logger.info('prompt block updated', { blockKey, updatedBy, version: (data as PromptBlockRow).version });

  return data as PromptBlockRow;
}

export async function listPromptVersions(blockKey: string): Promise<PromptVersionRow[]> {
  const { data, error } = await supabase
    .from('agent_prompt_versions')
    .select('version, content, updated_by, created_at')
    .eq('block_key', blockKey)
    .order('version', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []) as PromptVersionRow[];
}

/** Restaura uma versão antiga — grava o conteúdo antigo como edição nova, preservando a linha do tempo. */
export async function restorePromptVersion(
  blockKey: string,
  version: number,
  updatedBy: string,
): Promise<PromptBlockRow> {
  const { data, error } = await supabase
    .from('agent_prompt_versions')
    .select('content')
    .eq('block_key', blockKey)
    .eq('version', version)
    .single();

  if (error) throw new Error(error.message);

  return updatePromptBlock(blockKey, (data as { content: string }).content, updatedBy);
}

/** Prévia do prompt final montado, exatamente como o modelo recebe. */
export async function previewSystemPrompt(agentType: AgentType): Promise<string> {
  invalidatePromptCache();
  return loadSystemPrompt(agentType);
}

/** Blocos declarados no manifesto — usado pela semente para saber o que criar. */
export function manifestBlocks() {
  return PROMPT_BLOCKS;
}
