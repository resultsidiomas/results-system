# Painel do Agente — Results Idiomas

Painel interno para a equipe **ler e editar o prompt do agente** e **testar a
conversa** sem usar o WhatsApp.

## Rodar

```bash
cd frontend
cp .env.example .env      # preencher com Supabase + URL do backend
npm install
npm run dev               # http://localhost:5173
```

O backend precisa estar no ar (`cd backend && npm run dev`).

## Antes do primeiro acesso

1. **Migration:** rodar `database/migrations/20260810000001_agent_prompts.sql`
   no Supabase.
2. **Semente:** `cd backend && npm run seed:prompts` — leva os `.md` de
   `backend/agents/` para o banco.
3. **Usuário:** criar a conta no Supabase em Authentication → Users → Add user.
   Não existe cadastro pelo painel de propósito: quem tem conta edita o prompt
   do agente que atende os leads.

## As duas telas

### Prompt e informações

Blocos agrupados por categoria: comportamento e tom de voz, regras rígidas,
informações comerciais, informações de suporte e base de conhecimento.

Cada bloco mostra se ele **entra no prompt** a cada turno ou se é **consulta**
(chega ao agente pela busca semântica). Editar e salvar entra em produção em
até 30 segundos, sem deploy. Todo salvamento gera versão nova, e o botão
"Histórico" permite restaurar uma anterior.

"Ver prompt do comercial / do suporte" mostra o texto final montado,
exatamente como o modelo recebe — é a forma de conferir o efeito de uma edição
antes de testar.

### Área de testes

Conversa real com o agente: mesmo prompt, mesma memória, mesmo RAG, mesmo score
e mesmo handoff. A resposta aparece bolha por bolha, como o lead receberia.

O painel do lado direito mostra score do lead, dados coletados, se houve
handoff, se a tabela de preços seria enviada e se a IA foi pausada.

A etiqueta no topo diz por onde o turno passou:

- **fluxo n8n real** — a mensagem entrou pelo webhook do n8n e percorreu o
  fluxo inteiro; só o envio pela UAZAPI foi desviado. Exige
  `N8N_TEST_WEBHOOK_URL` no backend e o desvio configurado no fluxo (ver
  `docs/CONSOLE-TESTE-N8N.md`).
- **engine direto no backend** — sem a camada n8n (sem debounce e sem o
  fracionamento do fluxo). Todo o resto é idêntico.

**Nada é enviado por WhatsApp em nenhum dos dois casos.**

"Zerar sessão" apaga histórico, score e contato de teste. Trocar o nome da
sessão abre uma conversa nova e independente — útil para testar cenários
diferentes lado a lado.

## Deploy (EasyPanel)

O frontend é um serviço **separado** do backend — precisa da própria entrada
no EasyPanel, apontando pro Dockerfile desta pasta.

1. **App → Create Service → App**, source = mesmo repo GitHub do backend.
2. **Build path / context:** `frontend` (o Dockerfile está em `frontend/Dockerfile`,
   não na raiz do repo).
3. **Build method:** Dockerfile.
4. **Build args** — as três `VITE_*` são gravadas no bundle em tempo de
   *build*, não de runtime. Se o EasyPanel só oferecer "Environment
   Variables" sem opção de build arg, confirme que ele repassa essas
   variáveis para o `docker build` (algumas versões têm um toggle tipo "Build
   Variable" por variável); senão o bundle sobe com `VITE_API_URL` etc.
   vazios e o painel carrega em branco, mesmo com o container "no ar":
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` → URL pública do serviço do backend (ex.:
     `https://api.results.com`, sem barra no fim)
5. **Porta do container:** 80 (nginx servindo `dist/`).
6. Configurar domínio/subdomínio próprio (ex.: `app.results.com`) — não usar
   o mesmo domínio do backend, senão o link abre a API em vez do painel.

Depois do primeiro deploy, qualquer edição nas `VITE_*` exige **rebuild**
(redeploy), não só restart — são valores embutidos no JS gerado, não lidos do
ambiente do container em runtime.
