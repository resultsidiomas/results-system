import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  api,
  type AgentType,
  type ConversationPhase,
  type SavedConversationSummary,
  type SessionState,
  type TaggedMessage,
  type TurnResult,
} from '../lib/api';

const AGENT_LABELS: Record<AgentType, string> = {
  commercial: 'Comercial',
  support: 'Suporte',
};

/** Ordem do "Fluxo da conversa" em `commercial/prompt-v1.md`. */
const PHASES: Array<{ key: ConversationPhase; label: string }> = [
  { key: 'abertura', label: 'Abertura' },
  { key: 'qualificacao', label: 'Qualificação' },
  { key: 'conexao', label: 'Conexão' },
  { key: 'preco', label: 'Preço' },
  { key: 'experimental', label: 'Experimental' },
  { key: 'objecao', label: 'Objeção' },
];

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

  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

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
    const title = window.prompt('Nome pra essa conversa:', `${sessionId} — ${new Date().toLocaleDateString('pt-BR')}`);
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
    setNoteFor(null);
    await loadState();
  }

  function startNote(message: TaggedMessage) {
    setNoteFor(message.index);
    setNoteDraft(message.note ?? '');
  }

  async function submitNote(messageIndex: number) {
    const note = noteDraft.trim();

    try {
      if (note === '') {
        await api.deleteNote(sessionId, messageIndex);
      } else {
        await api.saveNote(sessionId, messageIndex, note);
      }
      setNoteFor(null);
      await loadState();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const collected = Object.entries(state.collectedData).filter(
    ([, value]) => value !== null && value !== undefined && value !== '',
  );
  const noteCount = state.messages.filter((message) => message.note).length;
  const currentPhase = PHASES.find((phase) => phase.key === state.conversationPhase);

  return (
    <div className="test-layout">
      <section className="chat">
        <header className="chat-header">
          {readOnly ? (
            <>
              <span className="badge saved">conversa salva</span>
              <strong className="saved-title">{viewingSave.title}</strong>
              <button onClick={() => void backToLive()}>Voltar pra sessão ativa</button>
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

        <div className="bubbles">
          {messages.length === 0 && (
            <p className="muted">
              Nenhuma mensagem ainda. Escreva como se fosse o lead — a conversa roda de verdade, mas
              nada é enviado para o WhatsApp.
            </p>
          )}

          {messages.map((message, position) => {
            const previous = messages[position - 1];
            // Só marca a troca de agente, não repete a etiqueta em toda bolha:
            // o que interessa observar é o momento em que o roteador trocou.
            const switched = message.role === 'assistant' && previous?.agentType !== message.agentType;

            return (
              <div key={`${message.index}-${position}`} className={`turn ${message.role}`}>
                {switched && (
                  <div className={`agent-divider ${message.agentType}`}>
                    <span>Agente {AGENT_LABELS[message.agentType]}</span>
                  </div>
                )}

                <div
                  className={
                    message.role === 'user'
                      ? 'bubble lead'
                      : `bubble agente ${message.agentType}`
                  }
                >
                  {message.content}
                </div>

                {message.role === 'assistant' && message.index >= 0 && (
                  <div className="bubble-tools">
                    {message.note && <p className="note">{message.note}</p>}

                    {noteFor === message.index ? (
                      <div className="note-editor">
                        <textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="O que você observou nessa resposta?"
                          rows={3}
                          autoFocus
                        />
                        <div className="note-actions">
                          <button className="primary" onClick={() => void submitNote(message.index)}>
                            Salvar
                          </button>
                          <button onClick={() => setNoteFor(null)}>Cancelar</button>
                          {message.note && (
                            <span className="muted small">Apagar o texto remove a observação.</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      !readOnly && (
                        <button className="link" onClick={() => startNote(message)}>
                          {message.note ? 'Editar observação' : 'Adicionar observação'}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {sending && (
            <div className="turn assistant">
              <div className="bubble agente pending">digitando…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>

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
        <h3>Fase da conversa</h3>
        <ol className="phases">
          {PHASES.map((phase) => (
            <li key={phase.key} className={phase.key === state.conversationPhase ? 'active' : ''}>
              {phase.label}
            </li>
          ))}
        </ol>
        <p className="muted small">
          {currentPhase
            ? `O agente declarou estar em "${currentPhase.label}" no último turno.`
            : 'O agente ainda não declarou fase. O agente de suporte não usa esse fluxo.'}
        </p>

        <h3>Análise da conversa</h3>
        <dl>
          <dt>Score do lead</dt>
          <dd>{state.leadScore} / 10</dd>

          <dt>IA pausada</dt>
          <dd className={state.pausarIa === 'Sim' ? 'flag' : ''}>{state.pausarIa}</dd>

          <dt>Observações registradas</dt>
          <dd>{noteCount}</dd>

          {lastTurn && (
            <>
              <dt>Caminho do último turno</dt>
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
            </>
          )}
        </dl>

        <h3>Dados coletados</h3>
        {collected.length === 0 ? (
          <p className="muted">Nada coletado ainda.</p>
        ) : (
          <dl>
            {collected.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
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
                <span className="muted small">
                  {new Date(save.created_at).toLocaleString('pt-BR')} · {save.message_count} mensagens
                  {save.note_count > 0 ? ` · ${save.note_count} obs.` : ''}
                </span>
                <button className="link danger" onClick={() => void removeSave(save)}>
                  apagar
                </button>
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
