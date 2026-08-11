import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import PromptsPage from './pages/PromptsPage';
import TestPage from './pages/TestPage';
import RealConversationsPage from './pages/RealConversationsPage';

type Tab = 'prompts' | 'teste' | 'reais';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>('prompts');

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (checking) return <p className="muted center">Carregando…</p>;
  if (!session) return <Login />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>Painel do Agente</strong>
          <span className="muted">Results Idiomas</span>
        </div>

        <nav>
          <button className={tab === 'prompts' ? 'tab active' : 'tab'} onClick={() => setTab('prompts')}>
            Prompt e informações
          </button>
          <button className={tab === 'teste' ? 'tab active' : 'tab'} onClick={() => setTab('teste')}>
            Área de testes
          </button>
          <button className={tab === 'reais' ? 'tab active' : 'tab'} onClick={() => setTab('reais')}>
            Conversas reais
          </button>
        </nav>

        <div className="user">
          <span className="muted">{session.user.email}</span>
          <button onClick={() => void supabase.auth.signOut()}>Sair</button>
        </div>
      </header>

      <main>
        {tab === 'prompts' && <PromptsPage />}
        {tab === 'teste' && <TestPage />}
        {tab === 'reais' && <RealConversationsPage />}
      </main>
    </div>
  );
}
