import { createClient } from '@supabase/supabase-js';
import type { FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../shared/http-errors.js';

/**
 * Cliente com a chave ANÔNIMA, só para validar o token do usuário logado.
 *
 * O `supabase` de `config/supabase.ts` usa a service role key, que ignora RLS e
 * autentica como o próprio backend — validar token com ele daria "ok" para
 * qualquer coisa. Aqui o token do painel é conferido contra o Auth do Supabase.
 */
const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface AdminUser {
  id: string;
  email: string;
}

/**
 * Exige um usuário autenticado no Supabase Auth.
 *
 * Quem pode entrar é decidido no painel do Supabase (Authentication → Users):
 * o painel não tem cadastro aberto, as contas são criadas manualmente pela
 * equipe. Não há papel/permissão por enquanto porque só a equipe interna tem
 * conta; se um dia houver acesso externo, o gate vira `app_metadata.role`.
 */
export async function requireAdmin(request: FastifyRequest): Promise<AdminUser> {
  const header = request.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('missing bearer token');
  }

  const token = header.slice('Bearer '.length).trim();
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    throw new UnauthorizedError('invalid or expired session');
  }

  return { id: data.user.id, email: data.user.email ?? 'desconhecido' };
}
