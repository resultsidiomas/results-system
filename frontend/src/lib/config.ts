/**
 * Configuração que o Vite grava no bundle em tempo de BUILD.
 *
 * O valor é congelado no JS gerado — não é lido do ambiente do container. Se o
 * build rodar sem essas variáveis, o painel sobe "no ar" e quebra em silêncio:
 * o cliente do Supabase não inicializa e a tela fica branca. Por isso a checagem
 * acontece aqui, antes de qualquer import que dependa delas.
 */

interface EnvVar {
  name: string;
  value: string | undefined;
  hint: string;
}

const REQUIRED: EnvVar[] = [
  {
    name: 'VITE_SUPABASE_URL',
    value: import.meta.env.VITE_SUPABASE_URL,
    hint: 'URL do projeto no Supabase (a mesma que o backend usa).',
  },
  {
    name: 'VITE_SUPABASE_ANON_KEY',
    value: import.meta.env.VITE_SUPABASE_ANON_KEY,
    hint: 'Chave anônima do Supabase. Nunca a service role key.',
  },
  {
    name: 'VITE_API_URL',
    value: import.meta.env.VITE_API_URL,
    hint: 'URL pública do backend Fastify, sem barra no fim.',
  },
];

export const missingEnvVars = REQUIRED.filter((item) => !item.value).map(({ name, hint }) => ({
  name,
  hint,
}));

/**
 * Painel em HTTPS chamando backend em HTTP: o navegador bloqueia a requisição
 * antes de sair, e o `fetch` falha com "Failed to fetch" — sem status, sem
 * resposta, indistinguível de backend fora do ar. Detectar aqui evita perder
 * tempo procurando o problema no lugar errado.
 */
export const mixedContentApiUrl =
  typeof window !== 'undefined' &&
  window.location.protocol === 'https:' &&
  /^http:\/\//i.test(import.meta.env.VITE_API_URL ?? '')
    ? (import.meta.env.VITE_API_URL as string)
    : null;

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
