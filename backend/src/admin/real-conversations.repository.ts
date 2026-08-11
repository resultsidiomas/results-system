import { supabase } from '../config/supabase.js';
import type { Conversation } from '../agents/shared/agent.memory.pg.js';
import { isTestPhone } from '../shared/test-contact.js';

export interface RealConversationSummary {
  contactId: string;
  name: string | null;
  /** Telefone parcialmente mascarado: identifica o contato sem espalhar o número inteiro. */
  phoneMasked: string;
  agentTypes: Array<'commercial' | 'support'>;
  leadScore: number;
  conversationPhase: string | null;
  messageCount: number;
  pausarIa: string;
  updatedAt: string;
}

interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
  pausar_ia: string;
}

/**
 * Últimos dígitos bastam pra equipe reconhecer de quem é a conversa (é assim que
 * o número aparece na lista do WhatsApp), sem replicar o telefone completo numa
 * segunda tela.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return phone;
  return `••••${digits.slice(-4)}`;
}

/**
 * Conversas de gente de verdade, do atendimento pelo WhatsApp.
 *
 * Exclui os contatos sintéticos do console (`test-<sessão>`): eles são do
 * próprio painel e já aparecem na aba de testes. Ordena pela conversa mexida
 * mais recentemente, que é a ordem em que a equipe quer revisar.
 */
export async function listRealConversations(limit = 50): Promise<RealConversationSummary[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, contact_id, agent_type, messages, lead_score, conversation_phase, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit * 2); // duas linhas por contato no pior caso (comercial + suporte)

  if (error) throw error;

  const rows = (data ?? []) as Array<
    Pick<
      Conversation,
      'contact_id' | 'agent_type' | 'messages' | 'lead_score' | 'conversation_phase' | 'updated_at'
    >
  >;
  if (rows.length === 0) return [];

  const contactIds = [...new Set(rows.map((row) => row.contact_id))];

  const { data: contactData, error: contactError } = await supabase
    .from('contacts')
    .select('id, phone, name, pausar_ia')
    .in('id', contactIds);

  if (contactError) throw contactError;

  const contacts = new Map(
    ((contactData ?? []) as ContactRow[])
      .filter((contact) => !isTestPhone(contact.phone))
      .map((contact) => [contact.id, contact]),
  );

  const byContact = new Map<string, RealConversationSummary>();

  for (const row of rows) {
    const contact = contacts.get(row.contact_id);
    if (!contact) continue;

    const existing = byContact.get(row.contact_id);
    const messageCount = (row.messages ?? []).length;

    if (!existing) {
      byContact.set(row.contact_id, {
        contactId: row.contact_id,
        name: contact.name,
        phoneMasked: maskPhone(contact.phone),
        agentTypes: [row.agent_type],
        leadScore: row.lead_score,
        conversationPhase: row.conversation_phase,
        messageCount,
        pausarIa: contact.pausar_ia,
        updatedAt: row.updated_at,
      });
      continue;
    }

    // Segunda linha do mesmo contato (o outro agente): soma as mensagens e
    // preserva score e fase, que só o comercial preenche.
    existing.agentTypes.push(row.agent_type);
    existing.messageCount += messageCount;
    existing.leadScore = Math.max(existing.leadScore, row.lead_score);
    existing.conversationPhase = existing.conversationPhase ?? row.conversation_phase;
  }

  return [...byContact.values()].slice(0, limit);
}

export interface RealConversationDetail {
  contact: { id: string; name: string | null; phoneMasked: string; pausarIa: string };
  conversations: Conversation[];
  leadScore: number;
  collectedData: Record<string, unknown>;
  conversationPhase: string | null;
}

export async function findRealConversation(contactId: string): Promise<RealConversationDetail | null> {
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, phone, name, pausar_ia')
    .eq('id', contactId)
    .maybeSingle();

  if (contactError) throw contactError;
  if (!contact) return null;

  const row = contact as ContactRow;
  // Contato de teste tem aba própria; deixar cair aqui confundiria a etiqueta
  // "conversa real", que é justamente o que a tela precisa deixar claro.
  if (isTestPhone(row.phone)) return null;

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', contactId);

  if (error) throw error;

  const conversations = (data ?? []) as Conversation[];
  const commercial = conversations.find((item) => item.agent_type === 'commercial') ?? null;

  return {
    contact: {
      id: row.id,
      name: row.name,
      phoneMasked: maskPhone(row.phone),
      pausarIa: row.pausar_ia,
    },
    conversations,
    leadScore: commercial?.lead_score ?? 0,
    collectedData: commercial?.collected_data ?? {},
    conversationPhase: commercial?.conversation_phase ?? null,
  };
}
