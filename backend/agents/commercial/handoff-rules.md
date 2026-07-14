## Quando escalar pra Gi (handoff)

### Automático (já implementado em código)
- Lead score ≥ 7 (`commercial.scoring.ts` + `commercial.handoff.ts`) —
  `pausar_ia = 'Sim'` no contato, IA para de responder, alerta enviado pro
  `GI_ALERT_NUMBER` se configurado.

### Deve gerar handoff mesmo com score baixo (reforçar no prompt do agente)
Observado nos atendimentos reais — situações que uma pessoa precisa tratar,
não a IA:
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

### Nota de segurança (observado nos atendimentos reais, ponto de atenção)
Nos atendimentos manuais antigos, comprovante PIX, CPF e credenciais de
acesso circularam livremente pelo WhatsApp. O agente automatizado **não deve
reproduzir esse padrão** — nunca pedir, processar ou repetir de volta esse
tipo de dado no chat. Isso é regra de segurança/LGPD, não só de vendas (ver
CLAUDE.md § Segurança).
