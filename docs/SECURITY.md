# Segurança, papéis e ciclo de vida

## Domínios de identidade

Há dois domínios separados:

```text
User (equipe)                 CustomerAccount (cliente)
ADMIN                         1:1 com Customer
ATTENDANT                     CustomerSession
TECHNICIAN                    CustomerSessionRefreshToken
RefreshToken
```

Clientes não autenticam como `User`. Access tokens de cliente exigem
`principalType=CUSTOMER_ACCOUNT` e não aceitam claims de papel interno.

## Sessões e cookies

- access tokens são JWT HS256 com duração de 15 minutos;
- refresh tokens são valores aleatórios opacos, persistidos somente por HMAC;
- sessões e refresh de clientes duram sete dias;
- refresh é rotacionado; reutilização de ancestral da família de cliente revoga
  a sessão;
- redefinir senha revoga as sessões do domínio correspondente;
- cookies de access/refresh são `HttpOnly`; em produção usam `Secure` e
  `SameSite=None`;
- cookies CSRF não são HttpOnly porque a SPA precisa ecoá-los em
  `x-csrf-token`; eles não contêm credenciais de sessão.

Rotas mutáveis autenticadas usam double-submit CSRF. Requisições públicas sem
cookie de sessão não exigem um token preexistente. CORS não substitui CSRF.

## Matriz de permissões

| Capacidade | ADMIN | ATTENDANT | TECHNICIAN |
|---|:---:|:---:|:---:|
| Gerenciar usuários internos | sim | não | não |
| Criar cliente | sim | sim | sim |
| Listar/consultar cliente | todos | todos | somente ligados à própria fila |
| Atualizar cliente | sim | sim | não |
| Excluir/anonimizar cliente | sim | não | não |
| Suspender/reativar/excluir conta do cliente | sim | não | não |
| Criar OS | sim | sim | não |
| Listar/consultar OS | todas | todas | somente atribuídas a si |
| Editar dados operacionais da OS | sim | sim | não |
| Excluir OS | sim | não | não |
| Atribuir técnico | sim | sim | não |
| Alterar status | sim | não | próprias, com transições limitadas |
| Ler/criar nota interna | sim | sim | nas próprias OS |
| Relatórios globais | sim | sim | não |

O técnico pode criar um cadastro de cliente, conforme a matriz atual, mas não
pode editar nem listar clientes sem vínculo com uma OS atribuída.

## Estados de ordem de serviço

Estados: `OPEN`, `IN_PROGRESS`, `WAITING`, `COMPLETED`, `CANCELLED`.

Transições administrativas (`ADMIN`):

```text
OPEN        → IN_PROGRESS | CANCELLED
IN_PROGRESS → WAITING | COMPLETED | CANCELLED
WAITING     → IN_PROGRESS | CANCELLED
COMPLETED   → nenhuma
CANCELLED   → nenhuma
```

O técnico não pode cancelar: `OPEN → IN_PROGRESS`, `IN_PROGRESS → WAITING |
COMPLETED` e `WAITING → IN_PROGRESS`. A OS precisa estar atribuída ao próprio
técnico. As atualizações usam condições contra conflitos concorrentes.

## Timeline e notas internas

`ServiceOrderEvent` registra criação, mudança operacional, status e atribuição.
O ator pode tornar-se nulo se o usuário for removido, preservando o histórico.
O portal projeta somente criação, status e atribuição; não recebe alterações
operacionais internas nem dados do ator.

`ServiceOrderNote` é append-only na API: só há criação e leitura paginada. A
nota é interna, respeita o escopo do técnico e nunca é projetada no portal.
Não existe expiração periódica para eventos ou notas: ambos permanecem enquanto
a OS existir e são removidos por cascata somente se a própria OS for excluída.

## Cliente, conta e retenção

- suspender uma `CustomerAccount` revoga sessões e consome refresh tokens ainda
  ativos;
- reativar permite novo login, sem restaurar sessões antigas;
- excluir apenas a conta remove a identidade de acesso, preservando `Customer`;
- excluir `Customer` só é permitido sem histórico de OS;
- quando existe histórico, a ação apropriada é anonimizar: remove a conta,
  revoga credenciais e apaga nome de contato, e-mail, telefone, documento e
  endereço, preservando as OS;
- a limpeza periódica remove cadastros pendentes, tokens expirados/usados e
  famílias de sessão após as janelas de retenção configuradas.

## Rate limiting

| Fluxo | Janela | Limite |
|---|---:|---:|
| API geral | 60 s | 120 por IP confiável |
| Escritas autenticadas | 60 s | 40 por IP confiável |
| Login/refresh/logout interno ou cliente | 15 min | 10 por IP |
| Recuperação de senha | 15 min | 5 por IP |
| Cadastro público | 15 min | 5 por IP+e-mail e 10 por IP |
| Reenvio de cadastro | 15 min | 3 por IP+e-mail e 10 por IP |
| Confirmação de cadastro | 15 min | 10 por IP |

Os limiters são ignorados em `NODE_ENV=test`. Em produção, a chave de IP só é
aceita após validação do proxy HMAC; headers enviados diretamente pelo cliente
não são confiados.

## Proxy autenticado

Com acesso direto desabilitado, todas as rotas exceto `/health` exigem headers
internos assinados. A assinatura cobre timestamp, método, caminho/query exatos e
IP normalizado. O timestamp possui janela curta e a comparação é constante.
`INTERNAL_PROXY_SECRET` precisa ter ao menos 32 bytes.

## RLS e Supabase

A migration `20260928160000_harden_public_api_access` revoga privilégios das
roles `anon` e `authenticated` nas tabelas então existentes, habilita RLS sem
políticas permissivas e remove privilégios padrão futuros em `public`.
Migrations posteriores reforçam explicitamente tabelas sensíveis, incluindo
contas, sessões, tokens, outbox, eventos e notas.

O Prisma de produção usa atualmente uma conexão administrativa `postgres` com
`BYPASSRLS`; portanto RLS não substitui autorização do Express. O projeto não
usa `auth.uid()` nem Supabase Auth. Uma futura role dedicada exige planejamento
de credenciais, migrations e privilégios.

## Administrador principal

O seed marca uma única conta como `isPrimaryAdmin`. Essa conta não pode ser
excluída nem rebaixada por operações administrativas comuns. O sistema também
impede excluir/rebaixar o último `ADMIN` e impede autoexclusão.

## Dados sensíveis

Respostas selecionam campos explicitamente. `User.password`, hashes de refresh,
hashes de tokens, segredos e payloads internos da outbox não integram contratos
públicos. Falhas inesperadas retornam mensagem genérica, sem stack trace.
