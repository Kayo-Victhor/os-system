# API HTTP

Esta referência descreve os contratos implementados. Não existe OpenAPI gerada.
As rotas Express não possuem prefixo interno; em produção o navegador usa
`/api`, removido pela Function da Vercel antes de chegar ao backend.

## Convenções

- JSON em requisições e respostas, exceto respostas `204` sem corpo.
- IDs são UUIDs.
- datas de entidades são serializadas em ISO 8601.
- autenticação usa cookies; o frontend envia `credentials: include`.
- operações mutáveis com sessão enviam `x-csrf-token` igual ao cookie CSRF.
- validações retornam normalmente `400` com `{ "error", "details" }`.
- `401` indica sessão ausente/inválida; `403`, papel/ownership/CSRF/proxy;
  `404`, recurso não visível; `409`, conflito de estado ou unicidade.
- a API não retorna senhas, hashes de senha, refresh hashes ou tokens de banco.

## Formato paginado

Clientes, ordens internas e notas usam:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0,
    "hasPreviousPage": false,
    "hasNextPage": false
  }
}
```

`page` começa em 1; `limit` aceita 1–100 e assume 20.

## Saúde

| Método | Rota | Autenticação | Resposta |
|---|---|---|---|
| GET | `/health` | pública, sem HMAC | `{ status: "ok", service: "os-system-api" }` |

## Cadastro e autenticação de cliente

| Método | Rota | Corpo/resultado principal |
|---|---|---|
| POST | `/auth/register` | alias compatível de `/auth/customer/register` |
| POST | `/auth/customer/register` | cria somente cadastro pendente e retorna `202` |
| POST | `/auth/customer/register/resend` | `{ email }`; resposta pública uniforme `202` |
| POST | `/auth/customer/register/confirm` | `{ token }`; cria `Customer` e `CustomerAccount` em transação |
| POST | `/auth/customer/login` | `{ email, password }`; define cookies de cliente |
| POST | `/auth/customer/refresh` | usa cookie de refresh e CSRF; rotaciona a sessão |
| POST | `/auth/customer/logout` | revoga sessão, limpa cookies, retorna `204` |
| GET | `/auth/customer/me` | perfil da própria conta e cadastro |
| POST | `/auth/customer/forgot-password` | `{ email }`; sempre retorna mensagem genérica `202` para e-mail válido |
| POST | `/auth/customer/reset-password` | `{ token, password }`; token de uso único |

Cadastro pendente:

```json
{
  "name": "Cliente Exemplo",
  "email": "cliente@example.com",
  "password": "senha-ficticia",
  "phone": "11999999999",
  "document": "DOC-EXEMPLO",
  "address": "Endereço fictício"
}
```

`name`, `email` e `password` são obrigatórios; senha aceita 8–128 caracteres.
Telefone, documento e endereço são opcionais. O solicitante não escolhe papel.

Uma conta suspensa não autentica. Confirmação e recuperação não revelam token em
resposta; os links são entregues pela outbox de e-mail.

## Portal do cliente

Todas as rotas exigem uma `CustomerSession` ativa. O backend deriva `customerId`
da sessão e nunca aceita um ID de cliente como prova de ownership.

| Método | Rota | Resultado |
|---|---|---|
| GET | `/auth/customer/service-orders` | array das próprias OS, mais técnico quando atribuído |
| GET | `/auth/customer/service-orders/:id` | detalhe da própria OS |
| GET | `/auth/customer/service-orders/:id/events` | timeline pública filtrada |

O portal recebe criação, mudanças de status e atribuição de técnico. Não recebe
notas internas, alterações operacionais privadas, identidade do ator interno nem
dados de outros clientes. Um ID externo retorna `404`.

## Autenticação interna

| Método | Rota | Corpo/resultado principal |
|---|---|---|
| POST | `/auth/login` | `{ email, password }`; define cookies internos |
| POST | `/auth/refresh` | cookie de refresh + CSRF; rotaciona refresh |
| POST | `/auth/logout` | revoga refresh, limpa cookies, `204` |
| GET | `/auth/me` | `{ user: { id, name, email, role, isPrimaryAdmin } }` |
| POST | `/auth/forgot-password` | `{ email }`; resposta uniforme `202` |
| POST | `/auth/reset-password` | `{ token, password, passwordConfirmation }` |

Papéis válidos: `ADMIN`, `ATTENDANT`, `TECHNICIAN`. Usuários internos não passam
por confirmação de e-mail pública.

## Usuários internos

Todas as rotas exigem `ADMIN`.

| Método | Rota | Entrada/resultado |
|---|---|---|
| POST | `/users` | `{ name, email, password, role? }`; padrão `ATTENDANT`; `201` |
| GET | `/users` | lista; query opcional `role` |
| GET | `/users/:id` | detalhe sem senha/hash |
| PATCH | `/users/:id` | subconjunto de `{ name, email, role }` |
| DELETE | `/users/:id` | `204` |

O administrador principal, a autoexclusão e o último `ADMIN` possuem proteções
adicionais. E-mails não podem colidir entre identidades internas, contas de
cliente e cadastros pendentes.

## Clientes para a equipe

| Método | Rota | Acesso | Entrada/resultado |
|---|---|---|---|
| POST | `/customers` | todos os papéis internos | cria cadastro; não cria conta de acesso |
| GET | `/customers` | todos; técnico limitado à própria fila | `page`, `limit`, `search` |
| GET | `/customers/:id` | todos; técnico limitado à própria fila | detalhe e status de conta, se existir |
| PATCH | `/customers/:id` | ADMIN/ATTENDANT | campos parciais do cadastro |
| PATCH | `/customers/:id/account/status` | ADMIN | `{ status: "ACTIVE" | "SUSPENDED" }` |
| DELETE | `/customers/:id/account` | ADMIN | remove somente a identidade de acesso |
| POST | `/customers/:id/anonymize` | ADMIN | corpo vazio; preserva histórico de OS |
| DELETE | `/customers/:id` | ADMIN | somente quando não existe histórico de OS |

Campos aceitos na criação: `name` obrigatório; `email`, `phone`, `document` e
`address` opcionais. Busca cobre nome, e-mail e documento, sem diferenciar
maiúsculas/minúsculas.

Suspender, excluir a conta ou anonimizar revoga sessões de cliente. Exclusão de
um cliente com OS retorna `409` e orienta anonimização.

## Ordens de serviço

Valores:

```text
status:   OPEN | IN_PROGRESS | WAITING | COMPLETED | CANCELLED
priority: LOW | MEDIUM | HIGH | URGENT
```

| Método | Rota | Acesso | Entrada/resultado |
|---|---|---|---|
| POST | `/service-orders` | ADMIN/ATTENDANT | cria em `OPEN` com `{ title, description, priority?, customerId }` |
| GET | `/service-orders` | equipe; técnico limitado a si | paginação e filtros |
| GET | `/service-orders/technicians` | ADMIN/ATTENDANT | técnicos atribuíveis |
| GET | `/service-orders/:id` | equipe; técnico limitado a si | detalhe interno |
| PATCH | `/service-orders/:id` | ADMIN/ATTENDANT | `{ title?, description?, priority? }`, ao menos um |
| DELETE | `/service-orders/:id` | ADMIN | `204` |
| PATCH | `/service-orders/:id/technician` | ADMIN/ATTENDANT | `{ technicianId: UUID | null }` |
| PATCH | `/service-orders/:id/status` | ADMIN ou técnico da OS | `{ status }`, sujeito à máquina de estados |
| GET | `/service-orders/:id/events` | equipe; técnico limitado a si | timeline interna em ordem cronológica |
| GET | `/service-orders/:id/notes` | equipe; técnico limitado a si | notas paginadas |
| POST | `/service-orders/:id/notes` | equipe; técnico limitado a si | `{ content }`, 1–2000 caracteres; `201` |

Filtros de `GET /service-orders`:

```text
page, limit, status, priority, customerId, technicianId, search
```

`search` procura em título e descrição. Para técnico, um `technicianId`
manipulado é ignorado em favor do usuário autenticado. IDs malformados ou fora
do escopo são tratados como recurso não encontrado.

As respostas internas de criação, listagem, detalhe e alterações incluem:

```text
resolutionSlaMinutes: number | null
resolutionDueAt: data ISO 8601 | null
completedAt: data ISO 8601 | null
resolutionSlaStatus: ON_TRACK | DUE_SOON | BREACHED | MET | CANCELLED | UNTRACKED
```

As metas e a semântica desses campos estão em [SLA de resolução](SLA.md). As
projeções de `/auth/customer/service-orders` não expõem esses dados internos.

Notas são append-only: não há rotas de edição ou exclusão. Timeline e alterações
de OS são persistidas na mesma transação sempre que formam uma unidade lógica.

## Relatórios operacionais

| Método | Rota | Acesso | Query |
|---|---|---|---|
| GET | `/reports/operations` | ADMIN/ATTENDANT | `startDate`, `endDate`, `status`, `priority` |

Datas usam `AAAA-MM-DD`, precisam ser informadas em conjunto e aceitam no máximo
366 dias. Sem datas, o período é os últimos 30 dias. A data final é inclusiva no
fuso `America/Sao_Paulo`.

Resposta resumida:

```json
{
  "period": {
    "startDate": "2026-10-01",
    "endDate": "2026-10-31",
    "timeZone": "America/Sao_Paulo",
    "endDateInclusive": true
  },
  "filters": { "status": null, "priority": null },
  "currentDistribution": {
    "total": 0,
    "byStatus": [],
    "byPriority": []
  },
  "activity": {
    "createdTotal": 0,
    "completedTotal": 0,
    "daily": []
  },
  "workload": [],
  "completionHistory": {
    "source": "SERVICE_ORDER_EVENT",
    "earliestRecordedCompletionAt": null,
    "legacyCoverageLimited": true
  }
}
```

Distribuição e carga consideram ordens criadas no período e seu estado atual.
Carga inclui apenas `OPEN`, `IN_PROGRESS` e `WAITING`, agrupadas por técnico ou
“sem atribuição”. Conclusões usam exclusivamente o evento real de transição para
`COMPLETED`; `updatedAt` não é usado. Por isso o histórico pode não cobrir ordens
concluídas antes da timeline.

## Erros e concorrência

Exemplos de erros de domínio:

- `400`: payload/filtro/UUID de relacionamento inválido;
- `401`: cookies ausentes ou sessão expirada;
- `403`: papel, ownership, CSRF, CORS ou proxy não autorizado;
- `404`: entidade inexistente ou invisível para o ator;
- `409`: e-mail/documento em conflito, transição inválida, alteração concorrente
  de status/atribuição ou exclusão incompatível com histórico.

O texto exato de `details` é orientado pelos schemas Zod e pode evoluir sem mudar
o significado do status HTTP.
