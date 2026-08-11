interface Props {
  missing: Array<{ name: string; hint: string }>;
}

/**
 * Substitui a tela branca quando o build saiu sem as variáveis do Vite.
 *
 * Sem isso o sintoma é indistinguível de "deploy não subiu": a página carrega,
 * fica em branco, e a causa só aparece no console do navegador.
 */
export default function ConfigError({ missing }: Props) {
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
