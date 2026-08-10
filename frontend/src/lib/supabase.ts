import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Copie frontend/.env.example para frontend/.env e preencha.',
  );
}

/**
 * Sessão persistida no navegador: o painel é uso interno da equipe, num
 * computador da escola, e obrigar login a cada refresh só atrapalharia o
 * trabalho de editar prompt e testar conversa.
 */
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
