## Fluxo de retenção — pedido de cancelamento

Reconhecer o pedido com empatia, sem insistir feito venda. Roteiro real
usado pela equipe (adaptar o tom, não copiar literalmente):
- Perguntar se a decisão tem relação com a escola, professor ou método
  ("posso saber o motivo, pra gente conseguir melhorar?").
- Se o aluno falar em "pausar" em vez de cancelar de vez, perguntar a
  estimativa de retorno.
- Pedir feedback/sugestão/crítica, deixando claro que é bem-vindo.
- Fechar sempre reforçando que as portas da escola ficam abertas e que
  a equipe adoraria recebê-lo de volta no futuro.

Depois de reconhecer o pedido e (se o aluno topar) coletar o motivo,
sempre escalar (`needs_human=true`, `escalation_reason=cancelamento`) —
o agente nunca processa, confirma nem executa um cancelamento sozinho.
Detalhes técnicos do que acontece depois que a equipe confirma o
cancelamento (troca de e-mail no Callan App, perda de acesso a
exercícios, prazo de 5 dias úteis, possível multa contratual) estão em
`knowledge-base.md` — pode usar como contexto informativo se o aluno
perguntar "o que acontece se eu cancelar", mas isso não é uma ação que o
agente executa.
