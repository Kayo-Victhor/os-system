# Deploy, validação e rollback

Este guia descreve o procedimento operacional confirmado para publicar e
recuperar o OS-SYSTEM. A presença de uma configuração no repositório não prova
que um serviço externo esteja ativo ou usando o commit esperado: confira o
estado e o identificador da versão nos provedores em toda publicação.

## Pré-requisitos

### Ferramentas e acessos

- Git e acesso de escrita ao repositório GitHub;
- Node.js compatível com as dependências atuais e pnpm `11.21.0`;
- acesso autorizado aos projetos corretos da Vercel e do Render;
- acesso operacional ao projeto e aos backups do PostgreSQL no Supabase;
- permissão para consultar logs de build e runtime nos dois provedores;
- remetente Brevo validado para os testes de e-mail autorizados.

Trabalhe em uma estação confiável. Não copie segredos para comandos, issues,
releases, logs ou este documento. Consulte [CONFIGURATION.md](CONFIGURATION.md)
para a lista completa e a finalidade de cada variável.

Na **Vercel**, confirme `API_PROXY_TARGET` e `INTERNAL_PROXY_SECRET` no ambiente
de produção. No **Render**, confira todas as variáveis obrigatórias do backend,
em especial `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `API_BASE_PATH`,
`ALLOW_DIRECT_API_REQUESTS`, `INTERNAL_PROXY_SECRET`, os segredos JWT/HMAC e as
variáveis da Brevo.

Em produção, os valores de configuração esperados são `NODE_ENV=production`,
`API_BASE_PATH=/api` e acesso direto desabilitado. `CORS_ORIGIN` e
`APP_BASE_URL` devem corresponder à origem pública do frontend. `PORT` é
fornecida pelo ambiente do Render. O frontend de produção usa `/api`, não
`VITE_API_URL`.

`INTERNAL_PROXY_SECRET` precisa representar o mesmo segredo nos dois serviços,
mas sua conferência deve usar os mecanismos protegidos dos provedores, sem
exibir ou comparar os valores em texto aberto. Não use prefixo `VITE_` em
nenhum segredo.

## Preparação da release

Na raiz do repositório, confira o estado e identifique exatamente o commit:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline -10
git diff --check
```

1. Confirme que a branch é a configurada como produção na Vercel e será usada
   no deploy manual do Render.
2. Revise todo arquivo modificado e não rastreado. Arquivos necessários devem
   estar no commit; `.env`, relatórios e artefatos locais não devem entrar.
3. Use o SHA completo como identidade canônica. Em registros humanos, use
   `git-<12 primeiros caracteres do SHA>`, nunca apenas data ou “latest”.
4. Confirme que esse commit está no remoto antes de iniciar os deploys.

Execute as validações compatíveis com o escopo da release:

```bash
pnpm install --frozen-lockfile
pnpm --filter backend exec prisma validate
pnpm --filter backend exec prisma generate
pnpm lint
pnpm test:migrate
pnpm test
pnpm build
pnpm test:e2e:typecheck
pnpm test:e2e
git diff --check
```

Os testes que usam banco devem apontar exclusivamente para o banco local
descartável configurado para testes. Se uma validação não puder ser executada,
registre-a como pendente na release; não a marque como aprovada.

Para cada pasta nova em `apps/backend/prisma/migrations/`, revise o SQL e
confirme que nenhuma migration histórica foi editada. Procure remoção ou
renomeação de estruturas, conversões de tipo, índices bloqueantes, `NOT NULL`
sem backfill e qualquer perda de dados. Teste o histórico completo em banco
descartável e verifique se o schema novo continua compatível com a versão
anterior da aplicação durante um possível rollback.

## Topologia de produção

```text
Vercel (React/Vite + Function /api/proxy)
               │ HTTPS + HMAC
               ▼
Render (Express, PORT fornecida pelo ambiente ou 3333)
               │ Prisma / Supavisor
               ▼
Supabase PostgreSQL
```

## Frontend na Vercel

A configuração versionada está em `apps/frontend/vercel.json` e pressupõe o
diretório raiz `apps/frontend` no projeto Vercel.

- build: script `pnpm build` do workspace frontend;
- saída: `dist`;
- `/api/:proxyPath*`: rewrite para `/api/proxy` com captura interna;
- demais caminhos: fallback para `/index.html` da SPA.

Variáveis server-side:

```text
API_PROXY_TARGET=https://backend.exemplo.com
INTERNAL_PROXY_SECRET=<segredo aleatório de pelo menos 32 bytes>
```

`API_PROXY_TARGET` aceita somente a origem HTTPS, sem caminho, query ou
credenciais. A Function preserva método, corpo, cookies, CSRF, query legítima e
`Set-Cookie`; parâmetros internos de rewrite são removidos antes do upstream.

## Backend no Render

Não há `render.yaml` versionado; configuração de Dashboard deve ser conferida
manualmente. Os scripts disponíveis suportam:

```bash
pnpm install --frozen-lockfile
pnpm --filter backend build
pnpm --filter backend start
```

O artefato é `apps/backend/dist` e o processo executa `dist/server.js`. O backend
valida e usa `PORT` fornecida pelo ambiente; sem ela, mantém o padrão 3333.

Configure no Render todas as variáveis obrigatórias descritas em
[CONFIGURATION.md](CONFIGURATION.md), com atenção a:

```text
NODE_ENV=production
PORT=<porta inteira fornecida pelo ambiente, quando aplicável>
CORS_ORIGIN=https://frontend.exemplo.com
API_BASE_PATH=/api
ALLOW_DIRECT_API_REQUESTS=false
INTERNAL_PROXY_SECRET=<mesmo valor server-side da Vercel>
DATABASE_URL=<conexão PostgreSQL de produção>
APP_BASE_URL=https://frontend.exemplo.com
```

Não configure `VITE_API_URL`, `API_PROXY_TARGET` ou chaves públicas no Render.

## Banco de produção

O banco de produção é PostgreSQL no Supabase. Antes de uma release com migration:

1. Confirme, sem imprimir credenciais, que `DATABASE_URL` no Render aponta para
   o projeto e banco pretendidos.
2. Em um ambiente autorizado que receba essa variável de forma segura, consulte
   o histórico com:

   ```bash
   pnpm --filter backend exec prisma migrate status
   ```

   Não escreva a URL na linha de comando e não use o `.env` local como prova do
   estado de produção.
3. Compare as migrations pendentes com as pastas versionadas no SHA da release.
4. Para alteração relevante, confirme no Supabase a existência de backup ou
   ponto de recuperação utilizável, o horário coberto, a retenção e o
   procedimento de restauração permitido pelo plano. Quando o plano permitir,
   valide a recuperação em ambiente separado; a mera indicação de “backup
   ativo” não comprova que o objetivo de recuperação será atendido.
5. Registre esse ponto de recuperação e os responsáveis pela decisão antes de
   iniciar o build do backend.

Atualmente, a configuração operacional do Render executa `prisma migrate
deploy` durante o build do backend. Assim, iniciar o deploy manual também pode
alterar o schema antes de a nova instância atender tráfego. Confira no Dashboard
o comando exato: ele não está versionado neste repositório. Este guia não move a
etapa de migration para outro ponto do pipeline.

Se a migration for aplicada e uma etapa posterior do build ou deploy falhar, o
schema pode ficar adiantado enquanto a versão anterior continua atendendo
tráfego. Por isso, compatibilidade retroativa não é opcional nesse pipeline.

Em produção, nunca execute `prisma migrate dev`, `prisma migrate reset` ou
`prisma db push`; nunca edite migration aplicada e não trate rollback de
aplicação como rollback do banco.

## Publicação coordenada

A sequência abaixo pressupõe que o frontend novo funcione temporariamente com o
backend anterior e que o backend novo aceite o contrato já publicado. Se uma
mudança quebrar essa compatibilidade, não execute a sequência em uma única
release: divida-a em etapas aditivas e só remova o contrato antigo depois que
ambos os serviços tiverem migrado.

### 1. Registrar a release no GitHub

Confirme no terminal que o SHA preparado está no remoto e que o working tree
continua limpo. No GitHub, publique a release ou registro adotado pelo projeto
apontando exatamente para esse commit. Inclua migrations, alterações
operacionais, validações executadas e limitações conhecidas.

O repositório não contém workflow que comprove publicação automática de uma
GitHub Release. Não presuma que criar a release publica os provedores.

### 2. Confirmar o deploy da Vercel

No Dashboard da Vercel:

1. confira a Production Branch configurada;
2. localize o deployment de produção correspondente à release;
3. confirme que o SHA exibido é exatamente o SHA registrado;
4. confira build concluído e ausência de erro na Function `/api/proxy`.

`apps/frontend/vercel.json` processa `/api/:proxyPath*` antes do fallback da SPA,
desde que `apps/frontend` seja a raiz configurada do projeto.

### 3. Iniciar manualmente o deploy do Render

Depois de confirmar Vercel e o preparo do banco, use o Dashboard do Render para
iniciar o deploy manual do commit exato. Antes da ação, confira:

- repositório, branch e SHA selecionados;
- comando de build, incluindo a etapa atual de `prisma migrate deploy`;
- comando de início que executa `apps/backend/dist/server.js`;
- health check HTTP configurado para `/health`;
- nomes das variáveis obrigatórias, sem revelar valores.

### 4. Conferir build e inicialização

Nos logs do Render, confirme instalação com lockfile, migrations, build e o
processo escutando a `PORT` fornecida. Os workers não emitem uma mensagem
positiva de inicialização; verifique a ausência de falhas de ciclo e, quando
houver trabalho, os registros seguros de processamento da outbox e da limpeza.
Confirme no detalhe do deploy que o SHA do Render é o mesmo do GitHub e da
Vercel. Um serviço `Live` não prova igualdade de versão.

### 5. Verificações HTTP

Valide o caminho completo Vercel → proxy → Render:

```bash
curl --fail-with-body --show-error --silent \
  https://os-system-nine.vercel.app/api/health
```

Resultado esperado: HTTP 200 e:

```json
{"status":"ok","service":"os-system-api"}
```

Confirme também o health check do Render para `/health`. Esse endpoint responde
HTTP 200 enquanto o processo Express está operacional; ele não consulta banco
ou Brevo.

Para validar a fronteira HMAC, faça uma requisição direta e sem headers internos
a uma rota protegida do Render, por exemplo `GET /service-orders`. O esperado é
HTTP 403 com `Acesso não permitido`. Não use `/health`, que é público, nem tente
fabricar a assinatura ou copiar o segredo para a linha de comando.

Em primeira configuração ou rotação do proxy, altere o segredo de forma
coordenada nos dois serviços. Não troque apenas um lado e nunca use prefixo
`VITE_`.

### Verificador público automatizado

Com Vercel e Render disponíveis, execute na raiz do repositório:

```bash
pnpm smoke:production
```

O comando usa somente requisições `GET`, sem cookies, tokens ou credenciais, e
executa estas verificações:

| Destino | Resultado esperado | O que confirma |
|---|---:|---|
| frontend `/` | 200 final | SPA pública acessível; redirecionamentos são seguidos |
| frontend `/api/health` | 200 + JSON de saúde | rewrite, Function, assinatura HMAC e backend acessíveis |
| backend `/health` | 200 + JSON de saúde | processo Express acessível diretamente |
| frontend `/api/service-orders` | 401 | proxy alcançou a autenticação normal sem sessão |
| backend `/service-orders` | 403 | acesso direto sem assinatura continua bloqueado |

O timeout padrão é de 30 segundos por requisição. Para validar outro deployment
ou ajustar o timeout, informe somente origens sem caminho, query ou credenciais:

```bash
OS_SYSTEM_FRONTEND_URL=https://frontend.exemplo.com \
OS_SYSTEM_BACKEND_URL=https://backend.exemplo.com \
OS_SYSTEM_SMOKE_TIMEOUT_MS=30000 \
pnpm smoke:production
```

Cada item imprime `PASS` ou `FAIL`. Falhas são classificadas como timeout, rede,
resposta HTTP/JSON inesperada ou erro do próprio script. Qualquer falha termina
com código diferente de zero. Para rotas de API, redirecionamentos são tratados
como resposta inesperada; somente a página inicial permite e informa o
redirecionamento até a resposta final.

O verificador não lê cabeçalhos sensíveis nem imprime corpos de erro. Ele não
compara os commits publicados porque os endpoints públicos da aplicação não
expõem um identificador confiável de build; a comparação autenticada é uma
responsabilidade separada do relatório de releases abaixo. Essa checagem pública
também não substitui os smoke tests autenticados, os testes de permissão ou a
validação de e-mails, banco e workers.

### Consistência entre releases

O relatório de releases complementa o smoke test HTTP consultando metadados
autenticados e somente de leitura do GitHub, da Vercel e do Render:

```bash
VERCEL_TOKEN=<token-local-de-leitura> \
VERCEL_PROJECT_ID=<project-id> \
VERCEL_TEAM_ID=<team-id-opcional> \
RENDER_API_KEY=<chave-local-de-leitura> \
RENDER_SERVICE_ID=<service-id> \
pnpm release:check
```

As credenciais são do operador local. O script não carrega `.env`, não grava
tokens e faz somente requisições HTTP `GET`. Configure as variáveis no ambiente
do processo ou no mecanismo protegido do terminal; não coloque valores reais
neste documento, no `package.json` ou em arquivos versionados.

Os identificadores não secretos podem ser obtidos nestes locais:

- `VERCEL_PROJECT_ID`: Settings > General do projeto Vercel ou o
  `.vercel/project.json` local não versionado, quando ele já existir;
- `VERCEL_TEAM_ID`: Settings da equipe Vercel ou `orgId` do mesmo arquivo; é
  opcional para projetos pessoais;
- `RENDER_SERVICE_ID`: URL ou página Settings do serviço no Dashboard Render.

Por padrão, a Vercel é verificada resolvendo diretamente o domínio de produção
`os-system-nine.vercel.app`. Para outro domínio, informe somente o hostname,
sem protocolo ou caminho:

```bash
VERCEL_PRODUCTION_DOMAIN=frontend.exemplo.com pnpm release:check
```

O timeout padrão por consulta é 15 segundos e pode ser ajustado entre 1 e
120000 milissegundos com `OS_SYSTEM_RELEASE_CHECK_TIMEOUT_MS`.

O comando:

1. consulta `refs/heads/main` diretamente em `origin` com `git ls-remote`, sem
   executar `fetch`, `pull`, merge, rebase ou reset;
2. resolve o domínio de produção pela API da Vercel e exige um deployment
   `READY`, com target `production`, pertencente ao projeto esperado e com SHA
   Git completo;
3. consulta pela API do Render os deploys filtrados por `status=live` e exige
   exatamente um deploy ativo com SHA Git completo;
4. compara cada SHA publicado com o `main` remoto usando apenas objetos Git já
   disponíveis no repositório local;
5. lista os arquivos entre as revisões e os classifica para frontend/proxy,
   backend, código compartilhado, operação/documentação ou revisão ambígua.

Se um commit necessário não estiver disponível localmente, o relatório não faz
um `fetch` implícito: retorna `UNKNOWN` e solicita que o operador disponibilize
o histórico de forma consciente antes de repetir a verificação.

Os estados possíveis são:

| Estado | Significado |
|---|---|
| `UP_TO_DATE` | o SHA publicado é exatamente o mesmo de `origin/main` |
| `NO_RUNTIME_DRIFT` | os SHAs diferem, mas somente caminhos/campos operacionais conhecidos foram identificados |
| `RUNTIME_DRIFT` | há mudanças conhecidas que podem afetar o runtime daquele serviço |
| `UNKNOWN` | credencial, metadata, SHA, histórico ou classificação não permitem uma conclusão segura |

O código de saída é `0` quando não há drift de runtime conhecido, `1` quando há
drift relevante que requer decisão operacional e `2` quando ao menos uma fonte
essencial não pôde ser verificada.

As regras consideram `apps/frontend/**` no runtime da Vercel,
`apps/backend/**` no runtime do Render e `packages/**`, lockfile, workspace,
Turbo e configurações raiz conhecidas como potencialmente compartilhados.
Testes, documentação e scripts operacionais isolados não contam como runtime.
O `package.json` raiz é analisado por campo: por exemplo, adicionar apenas
`release:check` ou `smoke:production` é operacional, enquanto dependências,
gerenciador de pacotes ou scripts de build são compartilhados. Arquivos sem uma
regra segura produzem `UNKNOWN`.

`NO_RUNTIME_DRIFT` é uma triagem por caminhos e campos conhecidos, não uma prova
absoluta de compatibilidade e nem autorização automática para deixar de
publicar. Revise o diff e as recomendações do relatório. Um rollback, alias
ambíguo, deploy sem metadata Git ou histórico divergente também exige revisão
manual.

Este comando não substitui `pnpm smoke:production`: o relatório compara releases
e não valida que os endpoints estejam respondendo. O smoke test valida o caminho
HTTP público e não compara versões. Nenhum dos dois substitui testes autenticados,
validação de banco, migrations, workers ou e-mails.

## Saúde e workers

`GET /health` retorna:

```json
{ "status": "ok", "service": "os-system-api" }
```

Esse endpoint fica fora da exigência HMAC. Ele confirma o processo HTTP, não a
conectividade completa do banco ou da Brevo.

O mesmo processo backend inicia:

- worker da outbox de e-mail;
- worker de limpeza de retenção.

Ambos coordenam concorrência por locks/claims no PostgreSQL. Em desligamento
`SIGTERM`/`SIGINT`, o servidor para de agendar ciclos, aguarda o ciclo corrente,
fecha conexões HTTP e desconecta Prisma, com limite de 15 segundos para conexões.

## Smoke tests pós-deploy

Registre horário, release, conta de teste e resultado. Use somente contas e
registros previamente autorizados; nunca modifique dados reais apenas para
“testar o deploy”.

### Leitura de dados de domínio

Autenticar cria registros técnicos de sessão mesmo quando nenhum dado de
negócio é alterado. Use contas de teste autorizadas e considere esse efeito ao
executar a checklist.

- [ ] Abrir a SPA e confirmar que rotas internas não interceptam `/api/*`.
- [ ] Entrar como `ADMIN`, `ATTENDANT` e `TECHNICIAN` e conferir os escopos.
- [ ] Listar e abrir uma ordem autorizada; confirmar a fila limitada do técnico.
- [ ] Conferir timeline e sua projeção pública no portal do cliente.
- [ ] Confirmar que notas internas são visíveis somente à equipe autorizada.
- [ ] Abrir relatórios com papel autorizado e conferir período e filtros.
- [ ] Entrar no portal com cliente de teste e confirmar isolamento de perfil,
      ordens e eventos.
- [ ] Revisar logs e estado da outbox sem expor tokens ou dados pessoais.

### Operações que modificam dados

- [ ] Com conta interna e cliente de teste, criar e editar uma OS.
- [ ] Atribuir/reatribuir técnico e executar somente transições válidas.
- [ ] Criar nota interna de teste e reconfirmar sua confidencialidade.
- [ ] Validar login, refresh e logout de sessão interna e de cliente.
- [ ] Com endereço controlado, testar cadastro, confirmação de e-mail e
      recuperação de senha, incluindo uso único dos links.
- [ ] Confirmar na outbox/logs a entrega, retry ou falha permanente prevista.

Se não houver massa de teste autorizada, registre os itens mutáveis como
pendentes em vez de executá-los em contas reais.

## Rollback e recuperação

### Escolha do escopo

- **Somente frontend:** reverta/promova na Vercel o último deployment saudável
  quando o defeito estiver na SPA ou Function e o backend continuar compatível.
- **Somente backend:** selecione no Render o último deploy saudável quando
  frontend e schema forem compatíveis. A ação é manual.
- **Ambos:** coordene os rollbacks quando houve mudança de contrato, cookies,
  proxy, autenticação ou dependência de ordem entre os componentes.

Antes da ação, registre incidente, versões atual e alvo, migrations já aplicadas
e compatibilidade esperada. Use as ações de rollback/redeploy dos Dashboards;
este repositório não possui comando próprio de rollback dos provedores.

### Banco de dados

Restaurar a aplicação anterior **não desfaz uma migration**. Migrations devem
ser compatíveis com a versão anterior quando o plano permitir rollback do
código. Mudanças destrutivas exigem estratégia antes do deploy, como expansão e
contração em releases separadas, backfill controlado e remoção posterior.

Não existe comando genérico seguro de rollback de banco neste projeto. Não
edite o histórico aplicado nem execute SQL inverso automaticamente. Restaurar
backup é excepcional: interrompa escritas, determine o ponto de recuperação,
estime a perda de dados, alinhe as versões da aplicação ao schema restaurado e
obtenha aprovação operacional explícita.

### Validação após rollback

Após qualquer rollback, confirme os SHAs ativos, repita `/api/health`, o health
check do Render e a recusa do acesso direto. Revise logs de inicialização,
migrations e workers e repita os smoke tests compatíveis com o incidente.

## Limitações e observabilidade

- `/health` verifica somente a resposta básica do processo Express. Não valida
  PostgreSQL, Supabase, Brevo, workers ou autenticação.
- E-mail é assíncrono: a resposta HTTP não comprova entrega. Falhas permanentes
  da outbox devem ser investigadas nos logs e no provedor.
- O `DeprecationWarning` do `pg` sobre consultas concorrentes em um cliente
  transacional está em acompanhamento. A causa mais provável envolve Prisma 7,
  `@prisma/adapter-pg` e relações dentro de transações; nenhuma correção foi
  aplicada. Não suprima o aviso nem atualize dependências sem regressão.
- O deploy do Render precisa ser iniciado manualmente enquanto o deploy
  automático permanecer desativado.
- Como não há `render.yaml`, branch, comandos, health check e variáveis do
  Dashboard podem divergir do repositório e devem ser conferidos por release.
- HTTP 200 em `/health` não substitui smoke tests e não prova que migrations,
  banco ou e-mails estejam funcionais.
