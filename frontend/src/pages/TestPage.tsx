import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  api,
  type AgentType,
  type SavedConversationSummary,
  type SessionState,
  type TaggedMessage,
  type TurnResult,
} from '../lib/api';
import ConversationMessages from '../components/ConversationMessages';
import ConversationAnalysis from '../components/ConversationAnalysis';

const AGENT_LABELS: Record<AgentType, string> = {
  commercial: 'Comercial',
  support: 'Suporte',
};

const EMPTY_STATE: SessionState = {
  viaN8n: false,
  messages: [],
  leadScore: 0,
  collectedData: {},
  pausarIa: 'Não',
  conversationPhase: null,
};

/**
 * Console de teste.
 *
 * A conversa roda de verdade: mesmo prompt, mesma memória no Redis, mesmo RAG,
 * mesmo score e mesmo handoff do atendimento real. Com o webhook de teste do
 * n8n configurado, a mensagem entra pelo fluxo real do n8n e só o envio pela
 * UAZAPI é desviado. Nada é enviado para nenhum WhatsApp em nenhum dos casos.
 */
export default function TestPage() {
  const [sessionId, setSessionId] = useState('teste-1');
  const [state, setState] = useState<SessionState>(EMPTY_STATE);
  const [pending, setPending] = useState<TaggedMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastTurn, setLastTurn] = useState<TurnResult | null>(null);
  const [bypassN8n, setBypassN8n] = useState(false);

  const [saves, setSaves] = useState<SavedConversationSummary[]>([]);
  const [viewingSave, setViewingSave] = useState<SavedConversationSummary | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const readOnly = viewingSave !== null;
  const messages = readOnly ? state.messages : [...state.messages, ...pending];

  useEffect(() => {
    if (readOnly) return;
    void loadState();
  }, [sessionId]);

  useEffect(() => {
    void loadSaves();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  async function loadState() {
    try {
      setState(await api.sessionState(sessionId));
      setPending([]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadSaves() {
    try {
      const data = await api.listSavedConversations();
      setSaves(data.saves);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || sending || readOnly) return;

    // A mensagem do lead aparece na hora; o backend devolve o histórico
    // definitivo (com índice e agente) no `loadState` do fim do turno.
    setPending([
      {
        index: -1,
        role: 'user',
        content: message,
        at: new Date().toISOString(),
        agentType: 'commercial',
        note: null,
      },
    ]);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const turn = await api.sendTestMessage(sessionId, message, bypassN8n);
      setLastTurn(turn);
      await loadState();
    } catch (err) {
      setError((err as Error).message);
      setPending([]);
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    if (!window.confirm('Apagar essa sessão de teste (histórico, score, contato e observações)?')) {
      return;
    }

    try {
      await api.resetSession(sessionId);
      setLastTurn(null);
      setStatus('Sessão zerada.');
      await loadState();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveConversation() {
    const title = window.prompt(
      'Nome pra essa conversa:',
      `${sessionId} — ${new Date().toLocaleDateString('pt-BR')}`,
    );
    if (!title?.trim()) return;

    try {
      await api.saveConversation(sessionId, title.trim());
      setStatus(`Conversa salva como "${title.trim()}".`);
      await loadSaves();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function openSave(save: SavedConversationSummary) {
    try {
      const full = await api.loadSavedConversation(save.id);
      setState(full.payload);
      setPending([]);
      setViewingSave(save);
      setLastTurn(null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeSave(save: SavedConversationSummary) {
    if (!window.confirm(`Apagar a conversa salva "${save.title}"?`)) return;

    try {
      await api.deleteSavedConversation(save.id);
      if (viewingSave?.id === save.id) await backToLive();
      await loadSaves();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function backToLive() {
    setViewingSave(null);
    await loadState();
  }

  async function saveNote(messageIndex: number, note: string) {
    try {
      if (note === '') {
        await api.deleteNote(sessionId, messageIndex);
      } else {
        await api.saveNote(sessionId, messageIndex, note);
      }
      await loadState();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const noteCount = state.messages.filter((message) => message.note).length;

  return (
    <div className="test-layout">
      <section className="chat">
        <header className="chat-header">
          {readOnly ? (
            <>
              <span className={viewingSave.source === 'real' ? 'badge real' : 'badge saved'}>
                {viewingSave.source === 'real' ? 'conversa real salva' : 'conversa de teste salva'}
              </span>
              <strong className="saved-title">{viewingSave.title}</strong>
              <div className="header-actions">
                <button onClick={() => void backToLive()}>Voltar pra sessão ativa</button>
              </div>
            </>
          ) : (
            <>
              <label className="inline">
                Sessão
                <input
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                />
              </label>

              <span className={state.viaN8n && !bypassN8n ? 'badge live' : 'badge'}>
                {state.viaN8n && !bypassN8n ? 'fluxo n8n real' : 'engine direto no backend'}
              </span>

              {state.viaN8n && (
                <label className="inline checkbox">
                  <input
                    type="checkbox"
                    checked={bypassN8n}
                    onChange={(e) => setBypassN8n(e.target.checked)}
                  />
                  pular n8n
                </label>
              )}

              <div className="header-actions">
                <button onClick={() => void saveConversation()} disabled={messages.length === 0}>
                  Salvar conversa
                </button>
                <button onClick={() => void reset()}>Zerar sessão</button>
              </div>
            </>
          )}
        </header>

        <ConversationMessages
          messages={messages}
          readOnly={readOnly}
          sending={sending}
          emptyText="Nenhuma mensagem ainda. Escreva como se fosse o lead — a conversa roda de verdade, mas nada é enviado para o WhatsApp."
          onSaveNote={saveNote}
        />
        <div ref={endRef} />

        {error && <p className="error">{error}</p>}
        {status && !error && <p className="status">{status}</p>}

        {!readOnly && (
          <form className="composer" onSubmit={send}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Mensagem do lead…"
              disabled={sending}
            />
            <button className="primary" type="submit" disabled={sending || input.trim() === ''}>
              Enviar
            </button>
          </form>
        )}
      </section>

      <aside className="analysis">
        <ConversationAnalysis
          phase={state.conversationPhase}
          leadScore={state.leadScore}
          pausarIa={state.pausarIa}
          noteCount={noteCount}
          collectedData={state.collectedData}
        />

        {lastTurn && (
          <>
            <h3>Último turno</h3>
            <dl>
              <dt>Caminho</dt>
              <dd>{lastTurn.via === 'n8n' ? 'fluxo n8n real' : 'backend direto'}</dd>

              <dt>Tempo de resposta</dt>
              <dd>{(lastTurn.elapsedMs / 1000).toFixed(1)}s</dd>

              {lastTurn.agentType && (
                <>
                  <dt>Agente que respondeu</dt>
                  <dd>{AGENT_LABELS[lastTurn.agentType]}</dd>
                </>
              )}

              <dt>Bolhas enviadas</dt>
              <dd>{lastTurn.bubbles.length}</dd>

              <dt>Tabela de preços</dt>
              <dd>
                {lastTurn.sendPriceTable
                  ? `enviada (${lastTurn.priceTableVariant ?? 'geral'})`
                  : 'não'}
              </dd>

              {lastTurn.handoff !== undefined && (
                <>
                  <dt>Handoff para a equipe</dt>
                  <dd className={lastTurn.handoff ? 'flag' : ''}>
                    {lastTurn.handoff ? 'sim' : 'não'}
                  </dd>
                </>
              )}

              {lastTurn.escalationReason && (
                <>
                  <dt>Motivo da escalação</dt>
                  <dd>{lastTurn.escalationReason}</dd>
                </>
              )}
            </dl>
          </>
        )}

        <h3>Conversas salvas</h3>
        {saves.length === 0 ? (
          <p className="muted">Nenhuma conversa salva ainda.</p>
        ) : (
          <ul className="saves">
            {saves.map((save) => (
              <li key={save.id} className={viewingSave?.id === save.id ? 'active' : ''}>
                <button className="link" onClick={() => void openSave(save)}>
                  {save.title}
                </button>
                <button className="link danger" onClick={() => void removeSave(save)}>
                  apagar
                </button>
                <span className="muted small">
                  <span className={save.source === 'real' ? 'tag real' : 'tag'}>
                    {save.source === 'real' ? 'real' : 'teste'}
                  </span>{' '}
                  {new Date(save.created_at).toLocaleString('pt-BR')} · {save.message_count} mensagens
                  {save.note_count > 0 ? ` · ${save.note_count} obs.` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        {lastTurn?.raw !== undefined && (
          <>
            <h3>Resposta crua do n8n</h3>
            <pre className="raw">{JSON.stringify(lastTurn.raw, null, 2)}</pre>
          </>
        )}
      </aside>
    </div>
  );
}
