import { supabase } from '../../config/supabase.js';
import { logger } from '../../shared/logger.js';
import type { ChatMessage } from './agent.types.js';

export interface Conversation {
  id: string;
  contact_id: string;
  agent_type: 'commercial' | 'support';
  messages: ChatMessage[];
  lead_score: number;
  collected_data: Record<string, unknown>;
  /** Etapa do funil de CRM (`novo_lead`, `qualificado`…) — não confundir com `conversation_phase`. */
  stage: string;
  /** Passo do roteiro em que o agente está, declarado por ele a cada turno. */
  conversation_phase: string | null;
  updated_at: string;
}

export async function getOrCreateConversation(
  contactId: string,
  agentType: 'commercial' | 'support',
): Promise<Conversation> {
  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', contactId)
    .eq('agent_type', agentType)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing as Conversation;

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({ contact_id: contactId, agent_type: agentType })
    .select()
    .single();

  if (createError) throw createError;
  return created as Conversation;
}

/** Só leitura — ao contrário de getOrCreateConversation, nunca cria linha nova. */
export async function findConversation(
  contactId: string,
  agentType: 'commercial' | 'support',
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', contactId)
    .eq('agent_type', agentType)
    .maybeSingle();

  if (error) throw error;
  return data as Conversation | null;
}

export async function appendConversationTurn(
  conversation: Conversation,
  userMessage: string,
  assistantMessage: string,
  leadScore: number,
  collectedData: Record<string, unknown>,
  conversationPhase?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const messages: ChatMessage[] = [
    ...conversation.messages,
    { role: 'user', content: userMessage, at: now },
    { role: 'assistant', content: assistantMessage, at: now },
  ];

  const core = {
    messages,
    lead_score: leadScore,
    collected_data: { ...conversation.collected_data, ...collectedData },
  };

  // `undefined` mantém o valor anterior: o suporte não declara fase e não deve
  // zerar a que o comercial gravou na mesma conversa.
  const withPhase =
    conversationPhase === undefined ? core : { ...core, conversation_phase: conversationPhase };

  const { error } = await supabase.from('conversations').update(withPhase).eq('id', conversation.id);
  if (!error) return;

  // A fase é diagnóstico do painel; a mensagem é o atendimento. Se a coluna não
  // existir (migration não aplicada no ambiente), regrava sem ela em vez de
  // deixar o turno inteiro falhar — quem chama trata exceção daqui virando
  // resposta de fallback ("tive um problema técnico") pro lead, a cada turno.
  if (withPhase === core) throw error;

  logger.error('conversation update with conversation_phase failed, retrying without it', {
    conversationId: conversation.id,
    errorMessage: error.message,
  });

  const { error: retryError } = await supabase
    .from('conversations')
    .update(core)
    .eq('id', conversation.id);

  if (retryError) throw retryError;
}
