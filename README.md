# OS System — Sistema de Gerenciamento de Ordens de Serviço

Sistema full-stack para gestão operacional de Ordens de Serviço (OS), cadastro e acompanhamento de clientes, atribuição de técnicos e controle da fila de atendimento.

## 🛠️ Arquitetura e Tecnologia

O projeto adota uma arquitetura em monorepo gerenciada via **pnpm workspaces** e **Turborepo**.

```text
[ Frontend (React + Vite) ]
             │
             │ HTTP / JSON / Cookies HttpOnly
             ▼
[ Backend (Express + TypeScript) ]
             │
             │ Prisma ORM
             ▼
[ PostgreSQL ]
     │                 │
     │ Local           │ Produção
     ▼                 ▼
[ Docker ]       [ Supabase PostgreSQL ]
```

### Tecnologias

### Frontend
- React 19
- React DOM 19
- React Router DOM 7
- Vite 8
- TypeScript 6
- ESLint 10

### Backend
- Node.js
- Express 5
- TypeScript 6
- Prisma 7
- PostgreSQL
- Argon2
- JWT
- Zod
- Helmet
- CORS
- Cookie Parser
- Express Rate Limit
- Vitest
- Supertest
- tsx

### Infraestrutura
- pnpm 11
- Turborepo
- Docker para desenvolvimento local
- Supabase PostgreSQL / Supavisor em produção
- Vercel para o frontend
- Render para o backend

### Supabase

O Supabase é utilizado como provedor de hospedagem do PostgreSQL em produção, através do **Supavisor / Session Pooler**.

O projeto **não utiliza Supabase Auth** como mecanismo principal de autenticação.

A autenticação da aplicação é gerenciada pelo próprio backend Express, incluindo emissão e validação dos tokens JWT e gerenciamento de refresh tokens.

---

# 🔑 Roles e Permissões de Acesso

## 1. ADMIN

**Perfil:** dono ou gestor principal da empresa.

Possui acesso administrativo amplo para gerenciamento de:

- usuários;
- permissões;
- clientes;
- ordens de serviço;
- intervenções administrativas;
- atribuição e reatribuição de técnicos;
- correções operacionais.

O ADMIN não precisa aprovar individualmente cada ordem de serviço criada por um USER.

---

## 2. USER

**Perfil:** atendente ou funcionário responsável pela operação diária do sistema.

De acordo com as regras atuais da aplicação, pode:

- cadastrar clientes;
- criar ordens de serviço;
- editar ordens de serviço;
- definir prioridades;
- acompanhar a fila de atendimento;
- atribuir técnicos;
- reatribuir técnicos;
- acompanhar a operação das OS.

A atribuição de uma OS a um técnico pelo USER não depende de aprovação do ADMIN.

---

## 3. TECHNICIAN

**Perfil:** técnico responsável pela execução das ordens de serviço.

Pode, conforme as regras de autorização implementadas:

- consultar ordens atribuídas a si;
- visualizar os detalhes necessários para execução;
- atualizar andamento/status;
- concluir atendimentos.

O acesso do técnico deve permanecer limitado às operações permitidas pelo backend.

---

## 4. CUSTOMER

**Perfil:** cliente final da empresa.

### Intenção funcional

O CUSTOMER deve poder:

- realizar login;
- consultar suas próprias ordens de serviço;
- visualizar detalhes das suas OS;
- acompanhar status;
- consultar histórico relacionado às suas ordens.

### Estado atual

A funcionalidade de CUSTOMER encontra-se **parcialmente implementada**.

A principal pendência está relacionada à associação entre a conta `User` e o registro correspondente em `Customer`, além da implementação completa do isolamento das consultas para garantir que um CUSTOMER só consiga acessar as próprias ordens.

A autorização deve ser realizada no backend e não apenas por ocultação de elementos da interface.

---

# 🔒 Segurança e Autenticação

## Autenticação

A aplicação utiliza autenticação própria baseada em JWT.

As senhas dos usuários são armazenadas utilizando hash com `Argon2`.

O fluxo de autenticação possui:

- access token;
- refresh token;
- rotação de refresh tokens;
- cookies HttpOnly;
- controle de sessão;
- logout/revogação conforme a implementação do backend.

Dados sensíveis não devem ser retornados desnecessariamente pela API.

Em particular:

- `User.password` não deve ser exposto;
- `RefreshToken.tokenHash` não deve ser exposto.

## Autorização

A autorização é realizada no backend através das roles e das regras de acesso implementadas nos middlewares, controllers e services.

A aplicação não depende do frontend para garantir segurança.

O frontend pode ocultar botões e funcionalidades para melhorar a experiência do usuário, mas isso **não substitui a autorização do backend**.

Quando necessário, as regras de acesso também devem verificar ownership, por exemplo, garantindo que um CUSTOMER só consiga acessar recursos pertencentes a ele.

---

# 🛡️ Supabase e Row Level Security

A conexão utilizada pelo Prisma em produção utiliza atualmente a role `postgres`.

Foi confirmado no ambiente de produção:

```text
current_user = postgres
current_role = postgres
rolbypassrls = true
```

Isso significa que as consultas realizadas pelo Prisma através dessa conexão não são restringidas por políticas RLS.

Portanto, a camada principal de autenticação e autorização da aplicação continua sendo o backend Express.

RLS deve ser tratado como uma camada adicional de proteção para acessos que estejam sujeitos às políticas do PostgreSQL/Supabase, especialmente possíveis acessos externos através da Data API/PostgREST.

A arquitetura atual **não utiliza `auth.uid()` como mecanismo de autorização do backend**, pois a aplicação utiliza JWT próprio e não Supabase Auth.

---

# 🗄️ Banco de Dados, Prisma e Migrations

## Configuração local

O ambiente local utiliza PostgreSQL através de Docker.

```text
Container: os-system-db
Porta: 5432
Banco de desenvolvimento: os_system
Banco de testes: os_system_test
```

O banco de desenvolvimento e o banco de testes são separados para evitar que a execução de testes afete os dados utilizados durante o desenvolvimento.

**Nunca execute testes apontando para o banco de produção.**

As credenciais devem ser configuradas através das variáveis de ambiente do projeto.

---

## Prisma

Schema:

```text
apps/backend/prisma/schema.prisma
```

Migrations:

```text
apps/backend/prisma/migrations/
```

### Gerar o Prisma Client

```bash
pnpm --filter backend prisma generate
```

### Aplicar migrations em desenvolvimento

```bash
pnpm --filter backend prisma migrate dev
```

### Verificar o estado das migrations

```bash
pnpm --filter backend prisma migrate status
```

Migrations que já foram aplicadas não devem ser editadas diretamente.

Alterações estruturais futuras devem ser realizadas através de uma nova migration.

Não utilize comandos destrutivos ou reset do banco como procedimento normal de desenvolvimento.

---

# 🚀 Como Executar o Projeto Localmente

## Pré-requisitos

- Node.js;
- pnpm 11.21.0 ou versão compatível;
- Docker;
- Docker Compose.

O projeto utiliza **pnpm como gerenciador de pacotes oficial**.

O arquivo de lock utilizado pelo monorepo é:

```text
pnpm-lock.yaml
```

O workspace é definido por:

```text
pnpm-workspace.yaml
```

Não utilize `npm install` ou `yarn` para instalar as dependências do monorepo.

Se existir um `package-lock.json` na raiz do projeto, ele não faz parte do fluxo oficial do monorepo e deve ser removido para evitar conflitos de detecção do gerenciador de pacotes.

---

# 📦 Instalação

Na raiz do projeto:

```bash
pnpm install
```

---

# 🐘 Banco de Dados Local

Inicie o PostgreSQL através do Docker:

```bash
docker compose up -d
```

O banco local deve estar disponível na porta:

```text
5432
```

---

# ⚙️ Variáveis de Ambiente

Crie:

```text
apps/backend/.env
```

a partir do arquivo:

```text
apps/backend/.env.example
```

Exemplo conceitual:

```env
PORT=3333
DATABASE_URL="postgresql://postgres:<senha>@localhost:5432/os_system?schema=public"
JWT_SECRET="seu_jwt_secret_dev"
JWT_REFRESH_SECRET="seu_jwt_refresh_secret_dev"
API_BASE_PATH="/api"
```

Não versione credenciais reais.

Para o frontend, a URL da API é configurada através de:

```env
VITE_API_URL="http://localhost:3333"
```

Os valores exatos devem seguir os arquivos `.env.example` e a configuração atual do projeto.

---

# ▶️ Executando o Ambiente Completo

Depois de instalar as dependências e configurar o banco e as variáveis de ambiente:

```bash
pnpm dev
```

O fluxo é:

```text
pnpm dev
   ↓
scripts/dev-check.mjs
   ↓
turbo dev
   ├── backend
   └── frontend
```

O `scripts/dev-check.mjs` realiza verificações antes da inicialização, incluindo:

- dependências instaladas;
- existência de `apps/backend/.env`;
- conectividade TCP com o PostgreSQL.

O script **não inicia, para ou reinicia o PostgreSQL**.

### Serviços locais

Backend:

```text
http://localhost:3333
```

Frontend:

```text
http://localhost:5173
```

O funcionamento do `pnpm dev` pela raiz foi validado no ambiente Linux, incluindo a inicialização simultânea do backend e frontend e o encerramento dos processos após `Ctrl+C`.

---

# 📦 Execução Individual

Caso seja necessário executar apenas um dos serviços:

### Backend

```bash
pnpm --filter backend dev
```

### Frontend

```bash
pnpm --filter frontend dev
```

---

# 🧪 Testes

O projeto possui uma suíte de testes automatizados no backend.

### Preparar o banco de testes e executar os testes

```bash
pnpm test:migrate
```

### Executar os testes

```bash
pnpm test
```

Os testes devem utilizar o banco:

```text
os_system_test
```

e nunca o banco de produção.

Resultados específicos de testes devem ser considerados válidos somente quando executados no ambiente correspondente.

---

# 🌐 API e Variáveis de Ambiente

## Backend

O backend utiliza:

```text
API_BASE_PATH
```

para definir o prefixo das rotas da API.

A configuração deve permanecer coerente entre backend, frontend e ambiente de deployment.

## Frontend

O frontend utiliza:

```text
VITE_API_URL
```

para definir o endereço utilizado para consumir a API.

Exemplo local:

```text
http://localhost:3333
```

A configuração exata pode variar conforme o ambiente.

---

# 📡 Arquitetura da Comunicação

Em desenvolvimento:

```text
Frontend
http://localhost:5173
        │
        ▼
Backend
http://localhost:3333
        │
        ▼
Prisma
        │
        ▼
PostgreSQL
localhost:5432
```

Em produção:

```text
Frontend
      │
      ▼
Vercel
      │
      ▼
Backend
      │
      ▼
Render
      │
      ▼
Prisma
      │
      ▼
Supabase PostgreSQL
via Supavisor / Session Pooler
```

---

# 📦 Deploy

| Componente | Hospedagem | Função |
|---|---|---|
| Frontend | Vercel | Aplicação React/Vite |
| Backend | Render | API Express |
| Database | Supabase | PostgreSQL |
| Connection Pooling | Supavisor | Conexão do backend com PostgreSQL |

O fluxo de deployment atual utiliza o repositório GitHub como origem para os deployments configurados na Vercel e no Render.

Não armazene secrets ou credenciais de produção no repositório.

---

# 🚦 Estado Atual das Funcionalidades

## Implementado

- Autenticação própria baseada em JWT.
- Refresh tokens com rotação.
- Gerenciamento de sessão.
- Proteção de dados sensíveis nas respostas da API.
- Gerenciamento de usuários conforme permissões implementadas.
- Gerenciamento de clientes conforme permissões implementadas.
- Criação e edição de Ordens de Serviço.
- Atribuição e reatribuição de técnicos.
- Controle de prioridade das OS.
- Alteração de status das OS.
- Controle de acesso para ADMIN.
- Controle de acesso para USER.
- Controle de acesso para TECHNICIAN.
- Painel operacional e visualização da fila de atendimento no frontend.

---

## Parcialmente Implementado

### CUSTOMER

A role CUSTOMER existe na arquitetura da aplicação, mas o fluxo completo do portal do cliente ainda não está concluído.

As principais pendências envolvem:

- associação entre `User` e `Customer`;
- isolamento completo das consultas do CUSTOMER;
- garantia de que uma conta CUSTOMER só consiga acessar suas próprias OS;
- conclusão dos endpoints/serviços necessários para o fluxo completo.

---

# 📋 Pendências

## Associação User ↔ Customer

Finalizar e validar o relacionamento necessário entre contas de usuário e registros de clientes, sem permitir acesso cruzado entre clientes.

A implementação deve garantir a autorização no backend.

---

## Auditoria da Data API / RLS do Supabase

A migration:

```text
20260906000000_enable_rls_lockdown
```

encontra-se preparada na estrutura do projeto.

Antes de qualquer aplicação em produção, é necessário confirmar:

- exposição das tabelas através da Data API/PostgREST;
- schemas expostos;
- grants para `anon`;
- grants para `authenticated`;
- possibilidade de acesso direto às tabelas da aplicação;
- risco real dessa exposição;
- necessidade de RLS;
- necessidade de restrição/revogação de grants;
- ou eventual necessidade de nenhuma alteração.

A migration não deve ser aplicada apenas para eliminar avisos do painel do Supabase.

---

## Role dedicada para Prisma

A conexão de produção utiliza atualmente a role `postgres`.

A possibilidade de utilizar uma role dedicada para o Prisma pode ser avaliada futuramente como melhoria de arquitetura e princípio de menor privilégio.

Essa alteração exige análise de impacto sobre:

- migrations;
- permissões;
- Prisma;
- deployment;
- manutenção;
- operações administrativas.

Nenhuma alteração de credencial de produção deve ser realizada sem essa avaliação.

---

## Testes em CI/CD

Validar e garantir que o ambiente de integração contínua configure corretamente:

```text
os_system_test
```

antes da execução dos testes que dependem do banco.

---

# 🧭 Decisões Arquiteturais Importantes

## Autenticação

A aplicação utiliza autenticação própria baseada em JWT.

Não utiliza Supabase Auth como mecanismo principal.

## Autorização

A autorização ocorre no backend.

O frontend não é considerado uma camada de segurança.

## Banco

O desenvolvimento utiliza PostgreSQL local através de Docker.

A produção utiliza PostgreSQL hospedado no Supabase.

## RLS

RLS não é utilizado como substituto da autorização implementada pelo backend.

Como a conexão Prisma de produção utiliza atualmente `postgres` com:

```text
rolbypassrls = true
```

as consultas realizadas pelo Prisma não são restringidas por RLS.

Qualquer adoção de RLS deve considerar separadamente os acessos realizados através da Data API/PostgREST e os acessos realizados pelo backend.

---

# 📌 Histórico Recente

A branch principal já contém os commits recentes relacionados à evolução do frontend:

```text
927ccd1 feat(frontend): refine operations layout and dashboard
6659c8b feat(frontend): improve service order queue controls
```

Essas alterações já foram incorporadas à `main` e enviadas ao repositório remoto.

---

# 📚 Estrutura Principal

```text
os-system/
├── apps/
│   ├── backend/
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   └── schema.prisma
│   │   └── src/
│   │
│   └── frontend/
│       └── src/
│
├── scripts/
│   └── dev-check.mjs
│
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── turbo.json
```

---

# ✅ Resumo do Estado Atual

O OS System possui atualmente uma arquitetura full-stack baseada em:

```text
React + Vite
      ↓
Express + TypeScript
      ↓
JWT + Cookies HttpOnly
      ↓
Prisma
      ↓
PostgreSQL
```

O ambiente local utiliza PostgreSQL em Docker e o ambiente de produção utiliza PostgreSQL hospedado no Supabase através do Supavisor.

A autenticação e autorização são controladas pelo backend.

As roles principais são:

```text
ADMIN
USER
TECHNICIAN
CUSTOMER
```

O fluxo de CUSTOMER ainda está parcialmente implementado e requer conclusão do vínculo entre usuário e cliente e validação completa do isolamento de acesso.

A questão de RLS/Data API do Supabase permanece como uma decisão técnica que deve ser baseada na exposição e nos grants efetivamente encontrados, e não apenas nos alertas do painel.

O comando principal para desenvolvimento local é:

```bash
pnpm dev
```

que executa as verificações do projeto e inicia backend e frontend através do Turborepo.