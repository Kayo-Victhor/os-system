# SLA de resolução

Esta é a política da primeira versão do SLA do OS-SYSTEM. Ela mede somente o
tempo corrido para resolução de uma ordem de serviço.

## Metas

| Prioridade | Meta de resolução |
|---|---:|
| `URGENT` | 240 minutos (4 horas) |
| `HIGH` | 480 minutos (8 horas) |
| `MEDIUM` | 1.440 minutos (24 horas) |
| `LOW` | 4.320 minutos (72 horas) |

O relógio começa em `createdAt` e usa horas corridas. Noites, fins de semana,
feriados e períodos em `WAITING` não pausam a contagem. Não existem calendários
úteis, pausas configuráveis, SLA de primeira resposta ou notificações nesta
versão.

A meta aplicada é persistida em `resolutionSlaMinutes` e o vencimento calculado
em `resolutionDueAt`. Uma mudança de prioridade substitui ambos conforme a nova
meta, sempre a partir do `createdAt` original; ela não reinicia o relógio. A
mudança de prioridade e o evento de auditoria são gravados na mesma transação.

Ordens existentes antes da migration permanecem com os dois campos nulos. Elas
não recebem prazo retroativo e são classificadas como `UNTRACKED`, inclusive
após mudança de prioridade.

## Estados calculados

| Estado | Semântica |
|---|---|
| `ON_TRACK` | ordem ativa com mais de 60 minutos restantes |
| `DUE_SOON` | ordem ativa entre 60 minutos antes do vencimento e o próprio vencimento |
| `BREACHED` | ordem ativa depois do prazo ou concluída depois dele |
| `MET` | ordem concluída no prazo, inclusive exatamente no vencimento |
| `CANCELLED` | ordem monitorada cancelada; deixa de possuir SLA ativo |
| `UNTRACKED` | ordem legada sem meta, ou conclusão sem evidência temporal confiável |

Para ordens concluídas, o cálculo usa `completedAt`. Um trigger executado com a
linha já bloqueada captura `clock_timestamp()` durante o comando que efetiva a
transição. O mesmo instante é aplicado ao evento `STATUS_CHANGED`
correspondente. `updatedAt` e o horário padrão do evento não são usados como
substitutos da conclusão.

Uma mudança real de prioridade é recusada depois de `COMPLETED` ou `CANCELLED`.
Edições de título ou descrição continuam permitidas, e reenviar a mesma
prioridade não recalcula a meta nem o vencimento.

Os campos `resolutionSlaMinutes`, `resolutionDueAt`, `completedAt` e
`resolutionSlaStatus` são projeções da API interna. Eles não são expostos
automaticamente pelas rotas do portal do cliente.
