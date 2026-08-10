import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type TurnResult } from '../lib/api';

interface Bubble {
  from: 'lead' | 'agente';
  text: string;
}

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
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTurn, setLastTurn] = useState<TurnResult | null>(null);
  const [state, setState] = useState<{ viaN8n: boolean; leadScore: number; collectedData: Record<string, unknown>; pausarIa: string } | null>(null);
  const [bypassN8n, setBypassN8n] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadState();
  }, [sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bubbles]);

  async function loadState() {
    try {
      const data = await api.sessionState(sessionId);
      setState(data);
      setBubbles(
        data.messages.map((message) => ({
          from: message.role === 'user' ? 'lead' : 'agente',
          text: message.content,
        })),
      );
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || sending) return;

    setBubbles((current) => [...current, { from: 'lead', text: message }]);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const turn = await api.sendTestMessage(sessionId, message, bypassN8n);
      setLastTurn(turn);

      // Mostra bolha por bolha, como o lead receberia no WhatsApp — é assim que
      // dá pra ver se o fracionamento quebrou um link ou gerou bolha só com
      // pontuação.
      const received = turn.bubbles.length > 0 ? turn.bubbles : [turn.reply];
      setBubbles((current) => [...current, ...received.map((text) => ({ from: 'agente' as const, text }))]);

      await loadState();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    if (!window.confirm('Apagar essa sessão de teste (histórico, score e contato)?')) return;
    try {
      await api.resetSession(sessionId);
      setBubbles([]);
      setLastTurn(null);
      await loadState();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const collected = Object.entries(state?.collectedData ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== '',
  );

  return (
    <div className="test-layout">
      <section className="chat">
        <header className="chat-header">
          <label className="inline">
            Sessão
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
            />
          </label>

          <span className={state?.viaN8n && !bypassN8n ? 'badge live' : 'badge'}>
            {state?.viaN8n && !bypassN8n ? 'fluxo n8n real' : 'engine direto no backend'}
          </span>

          {state?.viaN8n && (
            <label className="inline checkbox">
              <input type="checkbox" checked={bypassN8n} onChange={(e) => setBypassN8n(e.target.checked)} />
              pular n8n
            </label>
          )}

          <button onClick={() => void reset()}>Zerar sessão</button>
        </header>

        <div className="bubbles">
          {bubbles.length === 0 && (
            <p className="muted">
              Nenhuma mensagem ainda. Escreva como se fosse o lead — a conversa roda de verdade, mas
              nada é enviado para o WhatsApp.
            </p>
          )}
          {bubbles.map((bubble, index) => (
            <div key={index} className={`bubble ${bubble.from}`}>
              {bubble.text}
            </div>
          ))}
          {sending && <div className="bubble agente pending">digitando…</div>}
          <div ref={endRef} />
        </div>

        {error && <p className="error">{error}</p>}

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
      </section>

      <aside className="analysis">
        <h3>Análise da conversa</h3>

        <dl>
          <dt>Score do lead</dt>
          <dd>{state?.leadScore ?? 0} / 10</dd>

          <dt>IA pausada</dt>
          <dd className={state?.pausarIa === 'Sim' ? 'flag' : ''}>{state?.pausarIa ?? 'Não'}</dd>

          {lastTurn && (
            <>
              <dt>Caminho do último turno</dt>
              <dd>{lastTurn.via === 'n8n' ? 'fluxo n8n real' : 'backend direto'}</dd>

              <dt>Tempo de resposta</dt>
              <dd>{(lastTurn.elapsedMs / 1000).toFixed(1)}s</dd>

              {lastTurn.agentType && (
                <>
                  <dt>Agente que respondeu</dt>
                  <dd>{lastTurn.agentType === 'commercial' ? 'comercial' : 'suporte'}</dd>
                </>
              )}

              <dt>Bolhas enviadas</dt>
              <dd>{lastTurn.bubbles.length}</dd>

              <dt>Tabela de preços</dt>
              <dd>{lastTurn.sendPriceTable ? `enviada (${lastTurn.priceTableVariant ?? 'geral'})` : 'não'}</dd>

              {lastTurn.handoff !== undefined && (
                <>
                  <dt>Handoff para a equipe</dt>
                  <dd className={lastTurn.handoff ? 'flag' : ''}>{lastTurn.handoff ? 'sim' : 'não'}</dd>
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
