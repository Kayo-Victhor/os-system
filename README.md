# OS System

Sistema de gerenciamento de ordens de serviço: clientes, técnicos, ordens de
serviço e controle de acesso por papel (ADMIN / USER / TECHNICIAN / CUSTOMER).

## Sumário

- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados e migrations](#banco-de-dados-e-migrations)
- [Executando em desenvolvimento](#executando-em-desenvolvimento)
- [Testes](#testes)
- [Build](#build)
- [Papéis e permissões](#papéis-e-permissões)
- [Registro público de clientes](#registro-público-de-clientes)
- [Segurança](#segurança)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Limitações conhecidas](#limitações-conhecidas)

## Arquitetura

Monorepo (pnpm workspaces + Turborepo) com duas aplicações:

- **`apps/backend`** — API REST em Express + TypeScript, Prisma como ORM
  sobre PostgreSQL.
- **`apps/frontend`** — SPA em React 19 + Vite, consumindo a API do backend.

O frontend não tem lógica de autorização própria além de esconder/mostrar
controles de UI; toda decisão de segurança real é feita no backend.

## Tecnologias

**Backend:** Express 5, Prisma 7, PostgreSQL, Zod (validação), Argon2id
(hash de senha), JWT (access token), express-rate-limit, helmet,
cookie-parser, Vitest + Supertest (testes).

**Frontend:** React 19, React Router 7, Vite, TypeScript, CSS puro (sem
framework de UI).

## Requisitos

- Node.js 22+
- pnpm 11+
- PostgreSQL 16+ (ou Docker, veja abaixo)

## Instalação

```bash
pnpm install
```

## Variáveis de ambiente

Cada app tem seu próprio `.env.example`. Copie e preencha antes de rodar:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
cp .env.example .env   # apenas se for usar o docker-compose incluso
```

### `apps/backend/.env`

| Variável              | Descrição                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`         | Connection string do PostgreSQL usada pelo Prisma                          |
| `JWT_ACCESS_SECRET`     | Assina o access token (JWT, 15 min de validade)                            |
| `JWT_REFRESH_SECRET`   | Usado para HMAC dos refresh tokens antes de persistir no banco             |
| `CORS_ORIGIN`          | Origem do frontend autorizada a fazer requisições com cookies. **Obrigatório em produção** |
| `NODE_ENV`             | `development` \| `production`                                              |
| `SEED_ADMIN_PASSWORD`  | Sobrescreve a senha do admin criado pelo seed (veja abaixo)                 |

Gere segredos fortes com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### `apps/frontend/.env`

| Variável       | Descrição                          |
| -------------- | ------------------------------------ |
| `VITE_API_URL` | URL base da API backend             |

## Banco de dados e migrations

Subindo um PostgreSQL local via Docker (opcional):

```bash
docker compose up -d
```

Aplicando as migrations:

```bash
cd apps/backend
pnpm prisma migrate dev
```

> Duas migrations foram escritas manualmente, pois nenhuma sessão de
> trabalho neste projeto teve um banco de dados disponível para gerá-las
> via `prisma migrate dev`:
> - `20260813200000_add_refresh_token` (tabela `RefreshToken`, necessária
>   para o fluxo de sessão)
> - `20260821193500_add_customer_role` (adiciona `CUSTOMER` ao enum
>   `UserRole`, para o registro público de clientes)
>
> Ambas **precisam ser validadas** rodando o comando acima contra um banco
> descartável antes de aplicar em qualquer ambiente real.

Populando um usuário administrador inicial:

```bash
pnpm seed
```

Isso cria `admin@os-system.local` com a senha definida em
`SEED_ADMIN_PASSWORD` (ou `admin123456` como padrão de desenvolvimento, se a
variável não estiver definida — **defina-a** em qualquer ambiente
compartilhado).

## Executando em desenvolvimento

Da raiz do monorepo, um único comando inicia backend e frontend juntos:

```bash
pnpm dev
```

Isso roda algumas verificações rápidas antes de iniciar (dependências
instaladas, `apps/backend/.env` configurado, PostgreSQL respondendo na
porta configurada — sem nunca iniciar/parar/reiniciar o banco) e então
inicia os dois serviços via Turborepo, com cada linha de saída prefixada
pelo nome do pacote (`backend:` / `frontend:`) para ficar claro qual
serviço está produzindo qual log.

Backend em `http://localhost:3333`, frontend em `http://localhost:5173`.

Comandos individuais continuam funcionando normalmente, sem passar pelas
verificações acima:

```bash
pnpm --filter backend dev    # API em http://localhost:3333
pnpm --filter frontend dev   # SPA em http://localhost:5173
```

## Testes

O backend tem dois níveis de teste:

- **Testes unitários** (`apps/backend/tests/*.test.ts`) — Prisma mockado
  por arquivo (`tests/helpers/prisma-mock.ts`), não tocam em banco de
  dados nenhum. Rápidos, cobrem lógica de controller/validação/permissão
  isoladamente.
- **Testes de integração** (`apps/backend/tests/integration/*.test.ts`) —
  Prisma real, contra um banco de dados **dedicado exclusivamente a
  testes**. Cobrem os fluxos reais de ponta a ponta: login de verdade
  (não um token forjado), criação de registros reais, verificação de
  relacionamentos no banco, rotação de refresh token, etc.

### Configurando o banco de testes

**Nunca use o banco de desenvolvimento (`os_system`) para os testes** — a
suíte de integração apaga todos os dados de todas as tabelas antes de
cada teste.

```bash
# Crie um banco dedicado, ex.: os_system_test
createdb os_system_test   # ou via psql/ferramenta gráfica de sua preferência

cd apps/backend
cp .env.test.example .env.test
# edite .env.test com a DATABASE_URL do banco de testes

pnpm prisma migrate deploy   # aplica as migrations no banco de testes
```

O `.env.test` é carregado **apenas** pela suíte de testes
(`tests/setup.ts`) — nunca pelo `.env` principal, e nunca é lido por
`pnpm dev`. Há uma proteção que interrompe a suíte inteira, com um erro
claro, caso `DATABASE_URL` não contenha a palavra "test" — isso existe
especificamente para impedir que os testes rodem por engano contra
`os_system` ou qualquer banco de produção.

### Rodando

```bash
pnpm test                      # roda tudo (unitários + integração) via Turborepo
pnpm --filter backend test     # equivalente, direto no backend
```

Os testes de integração rodam com `fileParallelism` desabilitado
(configurado em `vitest.config.ts`) — como compartilham um único banco
real e cada um limpa as tabelas antes de rodar, arquivos de teste
precisam executar em sequência, não em paralelo, para não apagar dados
uns dos outros no meio da execução.

O frontend ainda não tem suíte de testes automatizados — veja
[Limitações conhecidas](#limitações-conhecidas).

## Build

```bash
pnpm build
```

Roda `tsc` + `vite build` no frontend e `tsc` no backend via Turborepo.

## Papéis e permissões

| Recurso                  | ADMIN | USER (atendente) | TECHNICIAN | CUSTOMER |
| ------------------------- | :---: | :---------------: | :---------: | :------: |
| Usuários — criar/editar/excluir | ✅ | ❌ | ❌ | ❌ |
| Usuários — visualizar     | ✅    | ❌                 | ❌          | ❌       |
| Clientes — criar/editar   | ✅    | ✅                 | ❌          | ❌       |
| Clientes — excluir        | ✅    | ❌                 | ❌          | ❌       |
| Clientes — visualizar     | ✅    | ✅                 | ✅          | ❌       |
| Ordens de serviço — criar | ✅    | ✅                 | ❌          | ❌       |
| Ordens de serviço — editar (título/descrição/prioridade) | ✅ | ❌ | ❌ | ❌ |
| Ordens de serviço — excluir | ✅  | ❌                 | ❌          | ❌       |
| Ordens de serviço — visualizar | ✅ | ✅              | ✅          | ❌       |
| Ordens de serviço — atribuir técnico | ✅ | ❌         | ❌          | ❌       |
| Ordens de serviço — alterar status | ✅ | ❌           | ✅ (apenas as suas) | ❌ |

> A página "Técnicos" é uma visão sobre a lista de usuários (filtrada por
> `role=TECHNICIAN`), então ela segue a mesma permissão de "Usuários —
> visualizar" (apenas ADMIN) — não é uma permissão separada.

### Sobre o papel CUSTOMER

`CUSTOMER` é um papel de login real (ver
[Registro público de clientes](#registro-público-de-clientes) abaixo),
diferente do registro de negócio `Customer` (nome/telefone/documento de
um cliente, gerenciado pela equipe via ADMIN/USER — isso não mudou).

O papel CUSTOMER recebe **propositalmente nenhuma permissão** além do que
qualquer usuário autenticado já tem (`GET /auth/me`, `POST /auth/logout`,
`POST /auth/refresh` — nenhum desses passa por checagem de permissão).
Não existe hoje um vínculo definido entre uma conta CUSTOMER e um
registro `Customer` (por e-mail? por um campo explícito preenchido no
registro? outra abordagem?) — decidir e implementar isso é um trabalho
futuro, não inventado aqui sem confirmação. Na prática, uma conta
CUSTOMER consegue se registrar e fazer login, mas ainda não tem nenhuma
funcionalidade própria além disso — ela recebe 403 em qualquer
funcionalidade administrativa, exatamente como esperado.


## Registro público de clientes

`POST /auth/register` (público, sem autenticação, mesmo rate limit de
`/auth/login`) permite que qualquer pessoa crie sua própria conta:

```json
{
  "name": "João",
  "email": "joao@example.com",
  "password": "senha123456"
}
```

A conta criada é **sempre** `CUSTOMER` — o endpoint não aceita um campo
`role` no corpo da requisição (não é apenas validado e rejeitado: o campo
simplesmente não existe no schema, então um `role: "ADMIN"` enviado pelo
cliente é descartado antes de chegar na camada de serviço). Não há
nenhum caminho de código pelo qual o cliente influencie o papel da conta
criada.

O endpoint não faz login automático — a conta é criada e a pessoa
autentica separadamente via `POST /auth/login`, do mesmo jeito que uma
conta criada por um admin via `POST /users`.

## Segurança

Resumo do que está implementado (detalhes no código, especialmente
`apps/backend/src/lib/` e `apps/backend/src/middlewares/`):

- **Senhas:** Argon2id (`memoryCost: 19456`, `timeCost: 2`), nunca texto puro.
- **Sessão:** access token JWT (15 min) em cookie `httpOnly`; refresh token
  opaco (não-JWT), com hash HMAC persistido no banco, rotacionado a cada uso,
  com detecção de reuso (revoga toda a família de tokens do usuário se um
  token já rotacionado for reapresentado).
- **CSRF:** double-submit cookie (`csrf_token` legível por JS + header
  `x-csrf-token`), aplicado a toda requisição mutável autenticada por cookie.
- **Rate limiting:** limite estrito em `/auth/login` e `/auth/refresh`
  (10 req/15 min), limite geral no restante da API (120 req/min). Usa
  armazenamento em memória — **não é adequado para múltiplas instâncias**
  sem um backend compartilhado (ex. Redis).
- **CORS:** origem explícita via `CORS_ORIGIN`, obrigatória em produção;
  `credentials: true`.
- **Headers:** `helmet()` com a configuração padrão.
- **Autorização:** verificada no backend em toda rota, nunca apenas no
  frontend. Inclui verificação de propriedade de recurso (ex. um TECHNICIAN
  só altera status de ordens atribuídas a ele mesmo).
- **Erros:** mensagens genéricas em falhas de login (não revela se o e-mail
  existe); stack traces nunca retornam ao cliente.

## Estrutura do projeto

```
scripts/
  dev-check.mjs      pré-checagens antes de `pnpm dev` (deps, .env, Postgres)
apps/
  backend/
    prisma/            schema, migrations, seed
    src/
      config/          permissões por papel
      controllers/      handlers HTTP
      services/         regras de negócio / acesso ao Prisma
      schemas/           validação (zod)
      middlewares/       auth, CSRF, rate limit, permissões
      lib/               tokens, cookies, hash de senha, erros do Prisma
      routes/
    tests/
      *.test.ts          testes unitários (Prisma mockado por arquivo)
      integration/        testes de integração (Prisma real, banco de testes)
      helpers/            mock do Prisma, fixtures reais, login real para testes
  frontend/
    src/
      api/               cliente HTTP, funções por recurso, tipos
      context/           AuthContext (sessão, permissões)
      components/         layout, guards de rota, componentes compartilhados
      pages/
```

## Limitações conhecidas

Documentadas aqui em vez de escondidas — para que o próximo passo seja
óbvio, não uma surpresa:

- **Duas migrations ainda não validadas contra um banco real**:
  `20260813200000_add_refresh_token` e `20260821193500_add_customer_role`
  (veja [Banco de dados e migrations](#banco-de-dados-e-migrations)) —
  escritas à mão porque nenhuma sessão de trabalho neste projeto teve
  acesso a um PostgreSQL real ou a instalação de dependências. Rode
  `pnpm prisma migrate dev` localmente antes de aplicar a qualquer
  ambiente real.
- **Testes de integração escritos mas nunca executados**, pelo mesmo
  motivo — sem acesso à rede, não foi possível rodar `pnpm install` nem
  conectar a um PostgreSQL real neste ambiente. Foram revisados
  estaticamente com bastante cuidado (incluindo rastrear manualmente
  qual código de status HTTP cada cenário deveria produzir antes de
  escrever a asserção, o que revelou e corrigiu bugs reais no caminho —
  veja o changelog no histórico do Git), mas **precisam ser rodados
  localmente** para confirmar que realmente passam.
- **Não existe portal do cliente** — o papel CUSTOMER pode se registrar e
  fazer login, mas não há vínculo definido com o registro de negócio
  `Customer` nem nenhuma funcionalidade própria além do login. Ver
  [Sobre o papel CUSTOMER](#sobre-o-papel-customer).
- **Sem paginação** nos endpoints de listagem (apenas filtros). Adequado
  para o volume atual; deve ser revisitado antes de produção com dados em
  escala.
- **Rate limiting em memória**, não compartilhado entre instâncias — ver
  nota em [Segurança](#segurança).
- **`SETTINGS_READ`/`SETTINGS_UPDATE`** existem como permissões declaradas
  em `config/permissions.ts` mas não têm rota, controller ou funcionalidade
  associada — aparentemente um placeholder de uma feature de configurações
  do sistema que nunca foi definida. Não implementado aqui por não haver
  escopo claro do que essa funcionalidade deveria fazer.
- **Frontend sem suíte de testes automatizados** — o app foi construído e
  revisado manualmente (resolução de imports, uso de tipos sob
  `verbatimModuleSyntax`, regras de hooks), mas não há testes de componente
  ou end-to-end.
- **Sem backend de lint configurado** (`apps/backend` não tem ESLint) — o
  frontend tem; o backend depende apenas do `tsc` para checagem estática.
- Nenhum comando que requer instalação de dependências ou acesso à rede
  (`pnpm install`, `typecheck`, `test`, `build`, `prisma migrate`, iniciar
  os servidores de desenvolvimento) pôde ser executado em nenhuma sessão
  de trabalho neste projeto até agora. Todo o código foi revisado
  estaticamente com o máximo de cuidado possível — incluindo, nesta
  sessão, testar isoladamente partes que não dependiam de rede/Postgres
  (sintaxe do script de pré-checagem, resolução de todos os imports do
  frontend, checagem de chaves/parênteses balanceados nos arquivos
  alterados) — mas o projeto como um todo **precisa ser validado
  localmente** (`pnpm install && pnpm dev`, e a suíte de testes) antes de
  ir para produção.
