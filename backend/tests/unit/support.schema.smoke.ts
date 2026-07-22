import { supportTurnSchema } from '../../src/agents/support/support.schema.js';

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${label}: ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) console.log('  actual:', actual, 'expected:', expected);
}

const validNoEscalation = supportTurnSchema.safeParse({
  reply: 'Você acessa o app Callan pelo link enviado no e-mail de matrícula.',
  needs_human: false,
  escalation_reason: null,
});
check('valid, no escalation -> success', validNoEscalation.success, true);

const validWithEscalation = supportTurnSchema.safeParse({
  reply: 'Entendi, vou encaminhar pra equipe confirmar o novo horário.',
  needs_human: true,
  escalation_reason: 'reagendamento',
});
check('valid, with escalation -> success', validWithEscalation.success, true);

const invalidReason = supportTurnSchema.safeParse({
  reply: 'x',
  needs_human: true,
  escalation_reason: 'motivo_invalido',
});
check('invalid escalation_reason -> fails', invalidReason.success, false);

const missingReply = supportTurnSchema.safeParse({
  needs_human: false,
  escalation_reason: null,
});
check('missing reply -> fails', missingReply.success, false);

const emptyReply = supportTurnSchema.safeParse({
  reply: '',
  needs_human: false,
  escalation_reason: null,
});
check('empty reply -> fails', emptyReply.success, false);
