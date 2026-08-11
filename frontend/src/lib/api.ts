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
  agentType?: 'commercial' | 'support';
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

export interface SessionState {
  viaN8n: boolean;
  messages: Array<{ role: string; content: string; at?: string }>;
  leadScore: number;
  collectedData: Record<string, unknown>;
  pausarIa: string;
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

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

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
};
