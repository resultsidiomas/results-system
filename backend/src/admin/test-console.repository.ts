import { supabase } from '../config/supabase.js';

export interface TestNote {
  message_index: number;
  note: string;
  created_by: string | null;
  updated_at: string;
}

export interface TestSaveSummary {
  id: string;
  session_id: string;
  title: string;
  created_by: string | null;
  created_at: string;
  message_count: number;
  note_count: number;
}

export interface TestSave extends TestSaveSummary {
  payload: Record<string, unknown>;
}

// ---------- observações ----------

export async function listNotes(sessionId: string): Promise<TestNote[]> {
  const { data, error } = await supabase
    .from('test_conversation_notes')
    .select('message_index, note, created_by, updated_at')
    .eq('session_id', sessionId)
    .order('message_index');

  if (error) throw error;
  return (data ?? []) as TestNote[];
}

/**
 * Uma observação por mensagem: reescrever substitui a anterior.
 *
 * O `onConflict` é o que torna a tela idempotente — a equipe edita a mesma
 * observação várias vezes enquanto lê a conversa, e sem isso cada correção
 * viraria uma linha nova.
 */
export async function upsertNote(
  sessionId: string,
  messageIndex: number,
  note: string,
  createdBy: string | null,
): Promise<TestNote> {
  const { data, error } = await supabase
    .from('test_conversation_notes')
    .upsert(
      { session_id: sessionId, message_index: messageIndex, note, created_by: createdBy },
      { onConflict: 'session_id,message_index' },
    )
    .select('message_index, note, created_by, updated_at')
    .single();

  if (error) throw error;
  return data as TestNote;
}

export async function deleteNote(sessionId: string, messageIndex: number): Promise<void> {
  const { error } = await supabase
    .from('test_conversation_notes')
    .delete()
    .eq('session_id', sessionId)
    .eq('message_index', messageIndex);

  if (error) throw error;
}

export async function deleteNotesOfSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('test_conversation_notes')
    .delete()
    .eq('session_id', sessionId);

  if (error) throw error;
}

// ---------- conversas salvas ----------

export async function createSave(
  sessionId: string,
  title: string,
  payload: Record<string, unknown>,
  createdBy: string | null,
): Promise<TestSaveSummary> {
  const { data, error } = await supabase
    .from('test_conversation_saves')
    .insert({ session_id: sessionId, title, payload, created_by: createdBy })
    .select('id, session_id, title, created_by, created_at, payload')
    .single();

  if (error) throw error;
  return toSummary(data);
}

export async function listSaves(): Promise<TestSaveSummary[]> {
  const { data, error } = await supabase
    .from('test_conversation_saves')
    .select('id, session_id, title, created_by, created_at, payload')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []).map(toSummary);
}

export async function findSave(id: string): Promise<TestSave | null> {
  const { data, error } = await supabase
    .from('test_conversation_saves')
    .select('id, session_id, title, created_by, created_at, payload')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return { ...toSummary(data), payload: data.payload as Record<string, unknown> };
}

export async function deleteSave(id: string): Promise<void> {
  const { error } = await supabase.from('test_conversation_saves').delete().eq('id', id);
  if (error) throw error;
}

/**
 * A lista mostra tamanho e quantidade de observações, e os dois vivem dentro do
 * `payload`. Contar aqui evita mandar a conversa inteira só pra montar a lista.
 */
function toSummary(row: Record<string, unknown>): TestSaveSummary {
  const payload = (row.payload ?? {}) as { messages?: unknown[] };
  const messages = Array.isArray(payload.messages) ? payload.messages : [];

  return {
    id: row.id as string,
    session_id: row.session_id as string,
    title: row.title as string,
    created_by: (row.created_by ?? null) as string | null,
    created_at: row.created_at as string,
    message_count: messages.length,
    note_count: messages.filter((message) => (message as { note?: unknown }).note).length,
  };
}
