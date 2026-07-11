# ADR-005: Modelo Claude para os Agentes

## Status
**Aceito** — 2026-06-28

## Contexto

Dois agentes com perfis diferentes:

- **M1 Comercial** — conversas de vendas, lead scoring, objeções, nuance emocional. Exige raciocínio de qualidade, respostas naturais e persuasivas.
- **M2 Suporte** — FAQs, reagendamentos, regras operacionais. Mais previsível, menos nuance.

Custo é variável relevante — cada mensagem gera tokens.

## Decisão

| Agente | Modelo | Justificativa |
|--------|--------|--------------|
| M1 Comercial | `claude-sonnet-4-6` | Conversas de venda exigem qualidade máxima. Custo justificado pelo valor de cada lead convertido. |
| M2 Suporte | `claude-sonnet-4-6` | Mesmo modelo por consistência e simplicidade inicial. Avaliar downgrade para Haiku após 30 dias com dados reais. |
| Tarefas internas (scoring batch, relatórios) | `claude-haiku-4-5-20251001` | Processamento em volume sem necessidade de qualidade conversacional. |

## Estratégia de custo

- Medir tokens por conversa nas primeiras 2 semanas
- Se custo mensal > R$ 500: avaliar Haiku para M2
- System prompts enxutos (sem padding desnecessário)
- Histórico de conversa: últimas **10 mensagens** no contexto (não toda a conversa)
- Caveman Ultra no CLAUDE.md economiza tokens nas sessões de desenvolvimento

## Variáveis

```env
CLAUDE_MODEL_COMMERCIAL=claude-sonnet-4-6
CLAUDE_MODEL_SUPPORT=claude-sonnet-4-6
CLAUDE_MODEL_BATCH=claude-haiku-4-5-20251001
CLAUDE_MAX_TOKENS=1024
```
