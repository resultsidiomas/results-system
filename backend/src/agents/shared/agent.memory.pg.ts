import { supabase } from '../../config/supabase.js';
import type { ChatMessage } from './agent.types.js';

export interface Conversation {
  id: string;
  contact_id: string;
  agent_type: 'commercial' | 'support';
  messages: ChatMessage[];
  lead_score: number;
  collected_data: Record<string, unknown>;
  stage: string;
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

export async function appendConversationTurn(
  conversation: Conversation,
  userMessage: string,
  assistantMessage: string,
  leadScore: number,
  collectedData: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  const messages: ChatMessage[] = [
    ...conversation.messages,
    { role: 'user', content: userMessage, at: now },
    { role: 'assistant', content: assistantMessage, at: now },
  ];

  const { error } = await supabase
    .from('conversations')
    .update({
      messages,
      lead_score: leadScore,
      collected_data: { ...conversation.collected_data, ...collectedData },
    })
    .eq('id', conversation.id);

  if (error) throw error;
}
