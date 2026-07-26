## Quando escalar pra Gi (handoff)

> **Avisar a Gi ≠ calar a IA** (ADR-014). São duas decisões separadas:
> `decideHandoff` devolve `handoff` (manda alerta) e `pauseAi` (grava
> `pausar_ia='Sim'`).
>
> **A IA só para de responder quando as duas condições valem juntas:**
> 1. **lead qualificado** — idioma (`interested_course`) **e** objetivo
>    (`objective`) coletados; e
> 2. **aceitação explícita de falar com uma pessoa** — `accepted_consultant=true`
>    (disse sim ao convite) ou `needs_human=true` (pediu humano por conta
>    própria).
>
> `wants_to_schedule` **não** pausa (decisão do usuário, 2026-07-25): o modelo
> marca esse campo com sinal implícito — na simulação bastou o lead responder
> "de manhã seria melhor pra mim" —, e sinal implícito não é aceitação. Topar a
> experimental **avisa** a Gi (só ela confirma horário real) e a IA segue na
> conversa.
>
> Quando pausa, dura **1 dia** (`AGENT_PAUSE_MAX_HOURS=24`, prazo absoluto
> contado do handoff) e depois a IA reassume sozinha — antes a pausa era
> permanente, porque a rotina de resume nunca foi implementada.
>
> Em **todo** o resto, o alerta vai pra Gi e a **IA continua respondendo**.
> Decisão do usuário em 2026-07-25.

### Automático (já implementado em código)
- Lead score ≥ 9 (`commercial.scoring.ts` + `agent.handoff.ts`) — alerta
  enviado pro `GI_ALERT_NUMBER` se configurado, **sem pausar a IA**: score é
  inferência de temperatura, não pedido do lead, e pausar aqui emudecia o
  agente no meio da qualificação. O alerta leva nome, e-mail, idioma,
  objetivo, disponibilidade, urgência, origem e score, pra Gi assumir a
  conversa já sabendo com quem está falando. Máximo de 1 alerta desses por
  dia por contato (o score fica ≥ 9 pra sempre depois de atingido).
- Falha técnica no turno (erro de API/parse): o agente responde o fallback
  prometendo que a equipe vai responder — então gera handoff de verdade,
  com motivo "Falha técnica no agente" (também **sem pausar**: o próximo
  turno pode funcionar normalmente). Sem isso o lead recebia a promessa
  e ninguém era avisado.

### Lead aceitou falar com um consultor — `accepted_consultant = true`
Marcar assim que o lead disser sim ao convite pra falar com um consultor da
equipe. Combinado com lead qualificado (idioma + objetivo), é **o único
caminho normal que tira a IA da conversa**: `pausar_ia='Sim'` por 1 dia.
Aceitação tem que ser clara ("pode ser", "sim, quero falar") — interesse
genérico ("legal", "vou pensar") ou preferência de horário **não** contam.
Se o lead aceitar antes de estar qualificado, a Gi é avisada mesmo assim, mas
a IA **continua** conversando pra fechar idioma e objetivo — passar um lead
cru pro consultor obriga a equipe a recomeçar do zero. O convite pro consultor
só deve ser feito depois de idioma + objetivo (ver `prompt-v1.md` §
"Perguntas de oferta").

### Deve gerar handoff mesmo com score baixo — `needs_human = true`
Situações abaixo o modelo marca `needs_human = true` no `collected_data`, o
que dispara handoff imediato independente do score. Antes essas regras
estavam escritas aqui mas **não existia caminho no código** pra elas: o
comercial só tinha handoff por score e por `wants_to_schedule`, então
"quero falar com uma pessoa" não escalava nada.
- Lead pede desconto/condição especial fora da tabela publicada, ou tenta
  negociar valor de contrato já ativo.
- Lead pede pra trocar plano/turma existente (mudança de contrato, não
  venda nova).
- Reclamação, pedido de cancelamento, problema técnico na plataforma
  (acesso, pagamento, aula com falha).
- Lead pede explicitamente falar com humano/atendente.
- Qualquer mensagem contendo ou pedindo dado sensível de pagamento
  (comprovante PIX, CPF, dados de cartão, credenciais de acesso) — IA nunca
  processa isso, direciona pra canal seguro e sinaliza handoff. Ver nota de
  segurança abaixo.
- Dúvida sobre o plano "Conversação" (preço não confirmado, ver
  `knowledge-base.md`).
- Lead confirma que quer agendar a aula experimental
  (`wants_to_schedule=true`) — handoff imediato pra Gi confirmar o
  horário real, independente do score (ver seção dedicada abaixo).

### Nota de segurança (observado nos atendimentos reais, ponto de atenção)
Nos atendimentos manuais antigos, comprovante PIX, CPF e credenciais de
acesso circularam livremente pelo WhatsApp. O agente automatizado **não deve
reproduzir esse padrão** — nunca pedir, processar ou repetir de volta esse
tipo de dado no chat. Isso é regra de segurança/LGPD, não só de vendas (ver
CLAUDE.md § Segurança).

### Agendamento de aula experimental — handoff sempre, não depende de score
Não existe integração de calendário real (agenda do Edu) — decisão
confirmada com o usuário (2026-07-23, ver
`docs/specs/2026-07-23-m1-commercial-agent-fase2-fixes-design.md`): o
agente nunca oferece dia/hora fixo, só coleta preferência de turno/dias.
Assim que o lead confirma que quer agendar, `wants_to_schedule=true` no
turno — isso **avisa a Gi imediatamente**, mesmo com score baixo, porque só um
humano pode confirmar o horário real. Motivo enviado pra Gi: "Lead quer
agendar aula experimental!" (diferente do "Lead quente!" do alerta por score).
**Não pausa a IA** (ADR-014): esse campo é marcado com sinal implícito, então a
IA segue respondendo até o lead aceitar explicitamente falar com um consultor.
Teto de 1 alerta desses por hora por contato.

### Origem do lead (`lead_source`)
Não dispara handoff sozinho, mas é dado obrigatório pro CRM (canal que
está convertendo). Coletado no fim da qualificação (ver
`commercial/prompt-v1.md` passo 2) — se a conversa terminar sem essa
resposta, não bloqueia o fluxo, só fica `null`.
