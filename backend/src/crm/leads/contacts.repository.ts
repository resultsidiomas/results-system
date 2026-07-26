import { supabase } from '../../config/supabase.js';

export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  type: 'lead' | 'student';
  pausar_ia: 'Sim' | 'Não';
  /** Bumpado por trigger em qualquer update — base da expiração da pausa. */
  updated_at?: string;
}

export async function findOrCreateContact(phone: string, name: string): Promise<Contact> {
  const { data: existing, error: findError } = await supabase
    .from('contacts')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing as Contact;

  const { data: created, error: createError } = await supabase
    .from('contacts')
    .insert({ phone, name: name || null, type: 'lead' })
    .select()
    .single();

  if (createError) throw createError;
  return created as Contact;
}

export async function findContactByPhone(phone: string): Promise<Contact | null> {
  const { data, error } = await supabase.from('contacts').select('*').eq('phone', phone).maybeSingle();
  if (error) throw error;
  return data as Contact | null;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}

export async function updatePausarIa(id: string, value: 'Sim' | 'Não'): Promise<void> {
  const { error } = await supabase.from('contacts').update({ pausar_ia: value }).eq('id', id);
  if (error) throw error;
}
