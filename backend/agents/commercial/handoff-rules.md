## Quando escalar pra Gi (handoff)

### Automático (já implementado em código)
- Lead score ≥ 9 (`commercial.scoring.ts` + `agent.handoff.ts`) —
  `pausar_ia = 'Sim'` no contato, IA para de responder, alerta enviado pro
  `GI_ALERT_NUMBER` se configurado. O alerta leva nome, e-mail, idioma,
  objetivo, disponibilidade, urgência, origem e score, pra Gi assumir a
  conversa já sabendo com quem está falando.
- Falha técnica no turno (erro de API/parse): o agente responde o fallback
  prometendo que a equipe vai responder — então gera handoff de verdade,
  com motivo "Falha técnica no agente". Sem isso o lead recebia a promessa
  e ninguém era avisado.

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
turno — isso dispara handoff **imediato**, mesmo com score baixo
(`commercial.scoring.ts` → `shouldHandoff(score, data)`), porque só um
humano pode confirmar o horário real. Motivo enviado pra Gi: "Lead quer
agendar aula experimental!" (diferente do motivo "Lead quente!" do
handoff por score).

### Origem do lead (`lead_source`)
Não dispara handoff sozinho, mas é dado obrigatório pro CRM (canal que
está convertendo). Coletado no fim da qualificação (ver
`commercial/prompt-v1.md` passo 2) — se a conversa terminar sem essa
resposta, não bloqueia o fluxo, só fica `null`.
