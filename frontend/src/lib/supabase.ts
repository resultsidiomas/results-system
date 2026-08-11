import { createClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from './config';

/**
 * Sessão persistida no navegador: o painel é uso interno da equipe, num
 * computador da escola, e obrigar login a cada refresh só atrapalharia o
 * trabalho de editar prompt e testar conversa.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
