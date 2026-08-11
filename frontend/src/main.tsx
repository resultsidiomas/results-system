import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { missingEnvVars } from './lib/config';
import ConfigError from './components/ConfigError';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

// `App` entra por import dinâmico de propósito: ele puxa `lib/supabase`, que não
// consegue criar o cliente sem as variáveis. Importar estático quebraria o
// módulo antes de conseguir renderizar a explicação.
if (missingEnvVars.length > 0) {
  root.render(<ConfigError missing={missingEnvVars} />);
} else {
  void import('./App').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
