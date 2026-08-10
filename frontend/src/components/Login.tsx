import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Login por e-mail e senha do Auth do Supabase.
 *
 * Não existe tela de cadastro de propósito: as contas do painel são criadas
 * manualmente pela equipe em Authentication → Users, no painel do Supabase.
 * Cadastro aberto aqui deixaria qualquer pessoa com o link editar o prompt do
 * agente que atende os leads.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    // Mensagem genérica de propósito: dizer "e-mail não existe" entregaria
    // quais contas existem para quem estiver testando de fora.
    if (signInError) setError('E-mail ou senha inválidos.');
    setLoading(false);
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Painel do Agente</h1>
        <p className="muted">Results Idiomas</p>

        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
