import { useEffect, useState } from 'react';
import { api, type RealConversationDetail, type RealConversationSummary } from '../lib/api';
import ConversationMessages from '../components/ConversationMessages';
import ConversationAnalysis from '../components/ConversationAnalysis';

/**
 * Atendimentos reais do WhatsApp, só leitura.
 *
 * Nada aqui responde nem escreve na conversa: é revisão do que o agente já fez
 * com gente de verdade. A única escrita é a observação da equipe, que vive numa
 * tabela separada e não toca no histórico do atendimento.
 */
export default function RealConversationsPage() {
  const [list, setList] = useState<RealConversationSummary[]>([]);
  const [selected, setSelected] = useState<RealConversationSummary | null>(null);
  const [detail, setDetail] = useState<RealConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.listRealConversations();
      setList(data.conversations);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function open(summary: RealConversationSummary) {
    try {
      setSelected(summary);
      setDetail(await api.realConversation(summary.contactId));
      setStatus(null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveNote(messageIndex: number, note: string) {
    if (!selected) return;

    try {
      if (note === '') {
        await api.deleteRealNote(selected.contactId, messageIndex);
      } else {
        await api.saveRealNote(selected.contactId, messageIndex, note);
      }
      setDetail(await api.realConversation(selected.contactId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveConversation() {
    if (!selected || !detail) return;

    const suggested = `${detail.contact.name ?? 'Lead'} ${detail.contact.phoneMasked} — ${new Date().toLocaleDateString('pt-BR')}`;
    const title = window.prompt('Nome pra guardar essa conversa:', suggested);
    if (!title?.trim()) return;

    try {
      await api.saveRealConversation(selected.contactId, title.trim());
      setStatus(`Guardada como "${title.trim()}". Aparece na lista de conversas salvas, marcada como real.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const noteCount = detail?.messages.filter((message) => message.note).length ?? 0;

  if (loading) return <p className="muted">Carregando…</p>;

  return (
    <div className="test-layout">
      <section className="chat">
        <header className="chat-header">
          <span className="badge real">conversa real</span>

          {detail ? (
            <>
              <strong className="saved-title">
                {detail.contact.name ?? 'Sem nome'} · {detail.contact.phoneMasked}
              </strong>
              <div className="header-actions">
                <button onClick={() => void saveConversation()}>Guardar conversa</button>
              </div>
            </>
          ) : (
            <span className="muted small">Escolha um atendimento na lista ao lado.</span>
          )}
        </header>

        {detail ? (
          <ConversationMessages
            messages={detail.messages}
            emptyText="Essa conversa não tem mensagens registradas."
            onSaveNote={saveNote}
          />
        ) : (
          <div className="bubbles">
            <p className="muted">
              Nenhum atendimento aberto. Estas são conversas de leads e alunos reais, atendidos pelo
              WhatsApp. Você pode ler e anotar, mas não responder por aqui.
            </p>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {status && !error && <p className="status">{status}</p>}
      </section>

      <aside className="analysis">
        <h3>Atendimentos reais</h3>
        {list.length === 0 ? (
          <p className="muted">
            Nenhuma conversa real ainda. Elas aparecem aqui assim que o agente atender alguém pelo
            WhatsApp.
          </p>
        ) : (
          <ul className="saves">
            {list.map((item) => (
              <li key={item.contactId} className={selected?.contactId === item.contactId ? 'active' : ''}>
                <button className="link" onClick={() => void open(item)}>
                  {item.name ?? 'Sem nome'} · {item.phoneMasked}
                </button>
                <span className="muted small">
                  {new Date(item.updatedAt).toLocaleString('pt-BR')} · {item.messageCount} mensagens
                  {item.leadScore > 0 ? ` · score ${item.leadScore}` : ''}
                  {item.pausarIa === 'Sim' ? ' · IA pausada' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        {detail && (
          <ConversationAnalysis
            phase={detail.conversationPhase}
            leadScore={detail.leadScore}
            pausarIa={detail.pausarIa}
            noteCount={noteCount}
            collectedData={detail.collectedData}
          />
        )}
      </aside>
    </div>
  );
}
