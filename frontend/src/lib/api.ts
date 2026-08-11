import { supabase } from './supabase';
import { apiBaseUrl as BASE_URL } from './config';

export interface PromptBlock {
  block_key: string;
  title: string;
  agent_scope: 'commercial' | 'support' | 'shared';
  category: 'comportamento' | 'comercial' | 'suporte' | 'regras' | 'conhecimento';
  content: string;
  version: number;
  updated_by: string | null;
  updated_at: string;
  description: string;
  in_prompt: boolean;
  used_by: Array<'commercial' | 'support'>;
}

export interface PromptVersion {
  version: number;
  content: string;
  updated_by: string | null;
  created_at: string;
}

export interface TurnResult {
  via: 'n8n' | 'backend';
  reply: string;
  bubbles: string[];
  agentType?: AgentType;
  conversationPhase?: ConversationPhase | null;
  handoff?: boolean;
  pauseAi?: boolean;
  pausarIa?: string | null;
  escalationReason?: string | null;
  sendPriceTable: boolean;
  priceTableVariant?: string | null;
  leadScore?: number;
  elapsedMs: number;
  raw?: unknown;
}

export type AgentType = 'commercial' | 'support';

export type ConversationPhase =
  | 'abertura'
  | 'qualificacao'
  | 'conexao'
  | 'preco'
  | 'experimental'
  | 'objecao';

export interface TaggedMessage {
  index: number;
  role: 'user' | 'assistant';
  content: string;
  at: string | null;
  /** Qual agente tratou a mensagem — o roteador pode trocar no meio da conversa. */
  agentType: AgentType;
  note: string | null;
}

export interface SessionState {
  viaN8n: boolean;
  messages: TaggedMessage[];
  leadScore: number;
  collectedData: Record<string, unknown>;
  pausarIa: string;
  conversationPhase: ConversationPhase | null;
}

export interface RealConversationSummary {
  contactId: string;
  name: string | null;
  phoneMasked: string;
  agentTypes: AgentType[];
  leadScore: number;
  conversationPhase: ConversationPhase | null;
  messageCount: number;
  pausarIa: string;
  updatedAt: string;
}

export interface RealConversationDetail extends SessionState {
  source: 'real';
  contact: { id: string; name: string | null; phoneMasked: string; pausarIa: string };
}

export interface SavedConversationSummary {
  id: string;
  session_id: string;
  title: string;
  created_by: string | null;
  created_at: string;
  message_count: number;
  note_count: number;
  source: 'teste' | 'real';
}

export interface SavedConversation extends SavedConversationSummary {
  payload: SessionState;
}

/**
 * Toda chamada leva o access token da sessão do Supabase no header. O backend
 * valida esse token contra o Auth do Supabase (`admin.auth.ts`) — não existe
 * senha própria do painel nem token compartilhado no bundle.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) throw new Error('Sessão expirada. Faça login de novo.');

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    // `fetch` só lança em falha de rede — bloqueio do navegador, DNS, conexão
    // recusada, CORS. Nunca em resposta de erro do servidor. O "Failed to fetch"
    // padrão não diz nem qual endereço foi tentado.
    throw new Error(
      `Não foi possível falar com o backend em ${BASE_URL || '(VITE_API_URL vazia)'}. ` +
        'Verifique se o serviço está no ar e se a URL está correta e em HTTPS.',
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = (body as { message?: string; error?: string }).message
      ?? (body as { error?: string }).error
      ?? `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export const api = {
  listPrompts: () =>
    request<{ blocks: PromptBlock[]; composition: Record<string, string[]> }>('/api/v1/admin/prompts'),

  savePrompt: (blockKey: string, content: string) =>
    request<PromptBlock>(`/api/v1/admin/prompts/block/${encodeURIComponent(blockKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  listVersions: (blockKey: string) =>
    request<{ versions: PromptVersion[] }>(`/api/v1/admin/prompts/versions/${encodeURIComponent(blockKey)}`),

  restoreVersion: (blockKey: string, version: number) =>
    request<PromptBlock>(`/api/v1/admin/prompts/restore/${encodeURIComponent(blockKey)}`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),

  previewPrompt: (agentType: 'commercial' | 'support') =>
    request<{ agentType: string; prompt: string; characters: number }>(
      `/api/v1/admin/prompts/preview/${agentType}`,
    ),

  sessionState: (sessionId: string) =>
    request<SessionState>(`/api/v1/admin/test-chat/${sessionId}`),

  sendTestMessage: (sessionId: string, message: string, bypassN8n: boolean) =>
    request<TurnResult>(`/api/v1/admin/test-chat/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message, bypassN8n }),
    }),

  resetSession: (sessionId: string) =>
    request<{ status: string }>(`/api/v1/admin/test-chat/${sessionId}`, { method: 'DELETE' }),

  saveNote: (sessionId: string, messageIndex: number, note: string) =>
    request<{ message_index: number; note: string }>(
      `/api/v1/admin/test-chat/${sessionId}/notes/${messageIndex}`,
      { method: 'PUT', body: JSON.stringify({ note }) },
    ),

  deleteNote: (sessionId: string, messageIndex: number) =>
    request<{ status: string }>(`/api/v1/admin/test-chat/${sessionId}/notes/${messageIndex}`, {
      method: 'DELETE',
    }),

  saveConversation: (sessionId: string, title: string) =>
    request<SavedConversationSummary>(`/api/v1/admin/test-chat/${sessionId}/save`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  listSavedConversations: () =>
    request<{ saves: SavedConversationSummary[] }>('/api/v1/admin/test-saves'),

  loadSavedConversation: (id: string) => request<SavedConversation>(`/api/v1/admin/test-saves/${id}`),

  deleteSavedConversation: (id: string) =>
    request<{ status: string }>(`/api/v1/admin/test-saves/${id}`, { method: 'DELETE' }),

  // ---------- conversas reais (WhatsApp) ----------

  listRealConversations: () =>
    request<{ conversations: RealConversationSummary[] }>('/api/v1/admin/conversations'),

  realConversation: (contactId: string) =>
    request<RealConversationDetail>(`/api/v1/admin/conversations/${contactId}`),

  saveRealNote: (contactId: string, messageIndex: number, note: string) =>
    request<{ message_index: number; note: string }>(
      `/api/v1/admin/conversations/${contactId}/notes/${messageIndex}`,
      { method: 'PUT', body: JSON.stringify({ note }) },
    ),

  deleteRealNote: (contactId: string, messageIndex: number) =>
    request<{ status: string }>(`/api/v1/admin/conversations/${contactId}/notes/${messageIndex}`, {
      method: 'DELETE',
    }),

  saveRealConversation: (contactId: string, title: string) =>
    request<SavedConversationSummary>(`/api/v1/admin/conversations/${contactId}/save`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
};
