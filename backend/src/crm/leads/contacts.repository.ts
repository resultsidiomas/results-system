import { supabase } from '../../config/supabase.js';

export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  type: 'lead' | 'student';
  pausar_ia: 'Sim' | 'Não';
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
