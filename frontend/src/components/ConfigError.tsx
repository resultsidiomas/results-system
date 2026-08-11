interface Props {
  missing: Array<{ name: string; hint: string }>;
  mixedContentUrl?: string | null;
}

/**
 * Substitui a tela branca (variáveis ausentes) e o "Failed to fetch" opaco
 * (backend em HTTP com painel em HTTPS) por uma explicação acionável.
 *
 * Sem isso os dois sintomas são indistinguíveis de "deploy não subiu": a causa
 * só aparece no console do navegador.
 */
export default function ConfigError({ missing, mixedContentUrl }: Props) {
  if (mixedContentUrl) {
    const suggested = mixedContentUrl.replace(/^http:/i, 'https:');

    return (
      <div className="config-error">
        <h1>Backend em HTTP, painel em HTTPS</h1>

        <p>
          O painel está sendo servido por HTTPS, mas <code>VITE_API_URL</code> aponta para um
          endereço HTTP:
        </p>

        <p>
          <code>{mixedContentUrl}</code>
        </p>

        <p>
          O navegador bloqueia essa chamada antes de ela sair — por isso o erro aparece como
          <em> Failed to fetch</em>, sem status. O backend pode estar perfeitamente no ar.
        </p>

        <h2>Como corrigir</h2>
        <ol>
          <li>
            No EasyPanel, abrir o serviço do <strong>backend</strong> e garantir que ele tem um
            domínio com SSL ativo (Let's Encrypt).
          </li>
          <li>
            No serviço do <strong>frontend</strong>, mudar o build arg <code>VITE_API_URL</code> para{' '}
            <code>{suggested}</code>.
          </li>
          <li>
            Refazer o <strong>build</strong> do frontend (redeploy) — reiniciar não basta, o valor
            fica gravado no JavaScript.
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="config-error">
      <h1>Painel não configurado</h1>

      <p>
        O build do frontend foi gerado sem {missing.length === 1 ? 'uma variável' : 'variáveis'} que
        o Vite precisa gravar no bundle:
      </p>

      <ul>
        {missing.map((item) => (
          <li key={item.name}>
            <code>{item.name}</code>
            <span className="muted"> — {item.hint}</span>
          </li>
        ))}
      </ul>

      <p>
        No EasyPanel, essas variáveis precisam entrar como <strong>build args</strong>, não como
        variáveis de ambiente do container: o Vite as grava no JavaScript em tempo de build, e o
        container não as lê depois. Depois de configurar, é preciso{' '}
        <strong>refazer o build</strong> (redeploy) — reiniciar o serviço não muda o bundle.
      </p>

      <p className="muted small">Detalhes em frontend/README.md, seção Deploy.</p>
    </div>
  );
}
