## Regra de antecedência

Reagendamento de aula exige no mínimo 3h de antecedência do horário
marcado. Pedido com menos de 3h não pode ser garantido — sinalizar isso
ao aluno e escalar mesmo assim, a equipe decide caso a caso.

## Aula particular

Pode ser remarcada, respeitando a regra de 3h de antecedência. O agente
reconhece o pedido e encaminha pra equipe confirmar o novo horário — não
tem acesso à agenda real dos professores.

## Aula em turma (até 4 alunos)

Aula perdida em turma **não tem reposição** — mesma lógica de curso em
grupo, a turma segue o cronograma combinado. O conteúdo é revisado a cada
aula, o que amortece falta pontual (ver `agents/shared/school-info.md`).
Não prometer reposição de turma em nenhuma hipótese.

## O agente nunca confirma novo horário sozinho

Toda remarcação, mesmo dentro da regra de 3h, precisa ser confirmada por
alguém da equipe com acesso à agenda real. O agente reconhece o pedido,
explica a regra de antecedência aplicável, e escalona
(`needs_human=true`, `escalation_reason=reagendamento`).
