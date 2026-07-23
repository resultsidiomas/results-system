## Regra de antecedência

Reagendamento gratuito exige aviso ao professor com no mínimo 3h de
antecedência do horário marcado. Pra alunos com aula entre 6h e 9h da
manhã, isso na prática significa avisar até 18h45 do dia anterior.

Pedido com menos de 3h de antecedência **ainda pode ser reagendado**,
mas tem custo de R$ 35,00 (o horário já estava reservado exclusivamente
pro aluno). Sinalizar esse valor ao aluno e escalar mesmo assim — o
agente nunca confirma o reagendamento nem cobra o valor sozinho, a
equipe decide e executa.

Antecipar uma aula (pedir horário mais cedo) é sempre gratuito e não
consome o limite mensal abaixo — é a opção mais vantajosa pro aluno.

## Limite mensal de reagendamentos gratuitos

Não acumula de um mês pro outro. Limite por frequência semanal do aluno:
- 1x/semana → 1 reagendamento grátis/mês
- 2x/semana → 2 reagendamentos grátis/mês
- 3x/semana → 3 reagendamentos grátis/mês
- 4x/semana → 4 reagendamentos grátis/mês
- 5x/semana → 5 reagendamentos grátis/mês

Pedido além do limite mensal: mesma lógica do aviso curto — sinalizar ao
aluno e escalar, a equipe decide caso a caso (pode envolver custo).

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
