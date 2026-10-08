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

O ADMIN não precisa aprovar individualmente cada ordem de serviço criada por um ATTENDANT.

---

## 2. ATTENDANT

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

A atribuição de uma OS a um técnico pelo ATTENDANT não depende de aprovação do ADMIN.

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

## 4. Cliente

**Perfil:** cliente final da empresa.

### Intenção funcional

O cliente deve poder:

- realizar login;
- consultar suas próprias ordens de serviço;
- visualizar detalhes das suas OS;
- acompanhar status;
- consultar histórico relacionado às suas ordens.

### Estado atual

Novos clientes usam uma identidade `CustomerAccount`, vinculada individualmente
ao cadastro `Customer`. O login independente está em `/customer/login` e o
portal autenticado em `/customer/area`. O backend deriva o `Customer` da sessão,
portanto IDs enviados pelo navegador não definem ownership.

Clientes não são `User`: toda autenticação de cliente passa exclusivamente por
`CustomerAccount`. Não há fallback para a autenticação interna.

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

### Sessão de cliente

`CustomerAccount` usa cookies próprios (`customer_access_token`,
`customer_refresh_token` e `customer_csrf_token`) e tabelas independentes:

```text
CustomerAccount
└── CustomerSession
    └── CustomerSessionRefreshToken
```

O access token expira em 15 minutos e declara explicitamente o principal
`CUSTOMER_ACCOUNT`. A sessão/refresh expira em 7 dias. Cada renovação consome o
refresh token anterior; os hashes de toda a família são preservados para que a
reutilização de qualquer token antigo revogue a sessão inteira. A redefinição
de senha revoga todas as sessões de cliente ativas sem afetar `RefreshToken` de
usuários internos.

Endpoints principais:

```text
POST /auth/customer/login
POST /auth/customer/refresh
POST /auth/customer/logout
GET  /auth/customer/me
GET  /auth/customer/service-orders
GET  /auth/customer/service-orders/:id
```

Dados sensíveis não devem ser retornados desnecessariamente pela API.

Em particular:

- `User.password` não deve ser exposto;
- `RefreshToken.tokenHash` não deve ser exposto.

### Verificação de e-mail

Usuários internos (`ADMIN`, `ATTENDANT` e `TECHNICIAN`) não exigem confirmação de e-mail para autenticação. O administrador inicial é criado exclusivamente pelo seed, que exige `ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` configurados no ambiente e nunca registra a senha. O seed mantém uma única conta marcada como administrador principal: ela preserva o mesmo identificador quando atualizada, não pode ser excluída nem rebaixada de papel e só pode ter seus dados próprios normais alterados pela própria conta.

O cadastro público permanece em `PendingCustomerRegistration` até a confirmação
do e-mail. A confirmação cria `Customer` e `CustomerAccount` em uma única
transação; usuários internos não utilizam esse fluxo.

## Autorização

A autorização é realizada no backend através das roles e das regras de acesso implementadas nos middlewares, controllers e services.

A aplicação não depende do frontend para garantir segurança.

O frontend pode ocultar botões e funcionalidades para melhorar a experiência do usuário, mas isso **não substitui a autorização do backend**.

Quando necessário, as regras de acesso também verificam ownership. No portal,
o backend deriva o `Customer` da `CustomerSession`, sem confiar em IDs enviados
pelo navegador.

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
- Controle de acesso para ATTENDANT.
- Controle de acesso para TECHNICIAN.
- Painel operacional e visualização da fila de atendimento no frontend.
- Cadastro confirmado, login, refresh, logout, recuperação de senha e portal
  próprios de `CustomerAccount`.
- Ownership de ordens do cliente derivado da sessão no backend.

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
ATTENDANT
TECHNICIAN
```

O fluxo de cliente usa `CustomerAccount` e `CustomerSession`, completamente
separado da autenticação interna.

A questão de RLS/Data API do Supabase permanece como uma decisão técnica que deve ser baseada na exposição e nos grants efetivamente encontrados, e não apenas nos alertas do painel.

O comando principal para desenvolvimento local é:

```bash
pnpm dev
```

que executa as verificações do projeto e inicia backend e frontend através do Turborepo.

## Relação Customer ↔ CustomerAccount

O cadastro operacional e a identidade autenticável são entidades distintas. Um
`Customer` pode existir sem acesso ao portal; uma `CustomerAccount` pertence a
exatamente um `Customer`. O cadastro público permanece pendente até a
confirmação do e-mail e só então cria ambos de modo transacional.

As consultas do portal derivam o `Customer` de `CustomerAccount.id` presente na
sessão validada. O backend não aceita `customerId` do navegador como prova de
ownership. Não existe relação entre `Customer` e `User`.

## Ciclo de vida e retenção do cliente

`CustomerAccount`, `Customer` e `ServiceOrder` possuem ciclos de vida
independentes. Somente `ADMIN` pode suspender ou reativar uma conta de acesso,
excluir suas credenciais ou anonimizar o cadastro. Suspensão revoga sessões e
tokens de recuperação; reativação permite um novo login, mas nunca restaura
sessões antigas.

Excluir uma `CustomerAccount` preserva o `Customer` e suas ordens. A
anonimização remove a conta de acesso, substitui o nome por um identificador
técnico e apaga e-mail, telefone, documento e endereço, mantendo o ID do
`Customer` e `ServiceOrder.customerId`. O hard delete de `Customer` só é
permitido quando não existe nenhuma ordem vinculada; quando há histórico, a API
retorna conflito e orienta o uso da anonimização.

Um worker no mesmo processo do backend remove dados temporários expirados em
lotes limitados, coordenados no PostgreSQL com `FOR UPDATE SKIP LOCKED`. O
intervalo (`CLEANUP_POLL_INTERVAL_MS`, padrão de uma hora) e o tamanho do lote
(`CLEANUP_BATCH_SIZE`, padrão 100) são configuráveis. Solicitações pendentes e
tokens de confirmação permanecem por uma hora após expirar; tokens de
redefinição usados ou expirados permanecem por 24 horas. Sessões e famílias de
refresh tokens permanecem por 24 horas após o fim da validade; uma sessão
revogada ainda é preservada até sua validade original terminar, mantendo a
detecção de reutilização de tokens. A outbox de e-mail possui ciclo de vida
próprio e não participa dessa limpeza.

## Operação de ordens por função

- **ADMIN** cria, consulta, edita, prioriza, exclui e atribui ordens; pode atribuir ou reatribuir somente usuários com a role `TECHNICIAN` e executar qualquer transição válida de status.
- **ATTENDANT** cria, consulta e edita dados operacionais das ordens, define prioridade e atribui ou reatribui técnicos. Não altera status nem exclui ordens.
- **TECHNICIAN** cria cadastros de clientes sem criar uma conta de acesso, vê apenas Customers associados a ordens atribuídas a ele e opera somente o status das próprias ordens atribuídas. Não pode editar Customer, alterar o cliente da ordem, reatribuir técnico ou excluir ordens.
- **Cliente autenticado por CustomerAccount** consulta somente o cadastro vinculado à própria sessão e suas ordens. Não pode criar ordens, alterar status, atribuir técnico ou acessar recursos administrativos.

`createdById` registra de forma imutável o usuário interno que criou a ordem,
`customerId` identifica o cliente atendido e também é imutável, e
`technicianId` identifica exclusivamente o `User(role=TECHNICIAN)` responsável
pela execução. O backend deriva o autor da sessão, valida o cliente e o técnico
e impõe os escopos de `customerId` e `technicianId`; filtros ou IDs enviados
pelo navegador nunca concedem acesso adicional.

A máquina de estados é:

```text
OPEN        -> IN_PROGRESS | CANCELLED
IN_PROGRESS -> WAITING | COMPLETED | CANCELLED
WAITING     -> IN_PROGRESS | CANCELLED
COMPLETED   -> estado terminal
CANCELLED   -> estado terminal
```

O ADMIN pode executar todas essas transições. O TECHNICIAN, somente em ordens
atribuídas a ele, pode iniciar, aguardar, retomar e concluir; cancelamento é
administrativo. Atualizações usam comparação otimista do estado/atribuição
anterior para rejeitar operações concorrentes incompatíveis.

## Segurança de autenticação e verificação de e-mail

O backend usa JWT de acesso com validade de 15 minutos em cookie HttpOnly e
refresh token opaco de sete dias, armazenado apenas como HMAC no banco. Todo
refresh é rotacionado; a reutilização de um token revogado invalida as sessões
ativas daquele usuário. Rotação e logout usam bloqueio transacional para que
requisições concorrentes não deixem um token substituto utilizável. Operações
com sessão exigem o token CSRF double-submit,
e o frontend o envia também durante o refresh automático.

O cadastro público cria primeiro uma solicitação pendente. Após a confirmação,
cria um `Customer` e uma `CustomerAccount` já verificada. Senhas novas exigem
ao menos oito caracteres. O token de confirmação é aleatório, é persistido somente como HMAC,
expira em 24 horas e possui uso único. Reenvios substituem o token anterior.
Não existe fluxo de `User(CUSTOMER)` nem endpoint de verificação de e-mail para
usuários internos.

E-mails de identidade são normalizados e exclusivos entre os domínios
`User` e `CustomerAccount`. Como essa unicidade atravessa duas tabelas, criação
e alteração de usuário interno e confirmação de cliente usam o mesmo bloqueio
transacional por e-mail e repetem a verificação imediatamente antes da escrita.
Os limites de cadastro e reenvio combinam teto por destinatário e por IP para
evitar contorno por rotação de endereços.

Configure no backend, sem expor valores ao frontend:

- `EMAIL_VERIFICATION_SECRET`: segredo exclusivo para HMAC dos links.
- `PASSWORD_RESET_SECRET`: segredo exclusivo para HMAC dos links de redefinição de senha.
- `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY` e `EMAIL_FROM`: envio transacional pela API HTTP da Brevo. `EMAIL_FROM` deve ser um endereço autorizado na conta Brevo; para o teste inicial, domínio próprio não é obrigatório.
- `APP_BASE_URL`: URL pública do frontend usada nos links de confirmação de cadastro e redefinição de senha; deve usar HTTPS em produção.

Para ativar o envio, crie uma conta na Brevo, gere uma API key transacional com o menor privilégio disponível e autorize um remetente individual na própria Brevo. Configure as variáveis somente no ambiente do backend; em desenvolvimento, use um remetente autorizado e `APP_BASE_URL=http://localhost:5173`. Um domínio próprio é recomendado para produção, mas não é necessário para o primeiro teste com remetente autorizado.

Cadastro, reenvio de confirmação e recuperação de senha gravam o estado e um
evento na outbox PostgreSQL na mesma transação. O worker do backend entrega o
evento posteriormente pela Brevo, com lote limitado e retry exponencial. Por
isso, a resposta HTTP `202` confirma apenas que a solicitação foi aceita; ela
não confirma que a mensagem já foi entregue. A coordenação entre instâncias é
feita no banco com leases e `FOR UPDATE SKIP LOCKED`.

A confirmação de cliente usa `POST /auth/customer/register/confirm` e o reenvio
genérico usa `POST /auth/customer/register/resend`. Recuperação de senha interna
usa `POST /auth/forgot-password` e `POST /auth/reset-password`; a recuperação de
cliente usa os endpoints correspondentes sob `/auth/customer`. Os links de
redefinição expiram em 60 minutos, são de uso único e cada solicitação substitui
o token anterior. Após a redefinição, as sessões do respectivo domínio são
revogadas. Os endpoints públicos respondem de forma uniforme e não dependem de
uma sessão em cookie.

Antes de produção, configure um domínio/remetente verificado no provider, uma
chave de envio com privilégio mínimo e uma caixa de teste autorizada para
validar o fluxo externo completo.
