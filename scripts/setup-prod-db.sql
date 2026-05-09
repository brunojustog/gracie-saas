-- Setup do banco de produção pro Gracie SaaS.
--
-- Rode UMA VEZ como superuser no Postgres do swarm:
--   docker exec -it $(docker ps -qf "label=com.docker.swarm.service.name=postgres_postgres") \
--     psql -U postgres -f /tmp/setup-prod-db.sql
--
-- (Antes copie o arquivo: `docker cp setup-prod-db.sql <container>:/tmp/`)

-- 1. Cria role dedicado pra app (não usa o superuser postgres)
CREATE ROLE gracie_saas WITH LOGIN PASSWORD 'TROCAR_NA_HORA_DE_RODAR';

-- 2. Cria o database, owner = role da app
CREATE DATABASE gracie_saas OWNER gracie_saas ENCODING 'UTF8' TEMPLATE template0;

-- 3. Privilégios mínimos
GRANT ALL PRIVILEGES ON DATABASE gracie_saas TO gracie_saas;

-- 4. Conecta no DB recém-criado pra setar permissões de schema (essas linhas
-- só fazem efeito se a sessão for trocada pra `gracie_saas`; veja runbook
-- do README pra detalhes).
\c gracie_saas
GRANT ALL ON SCHEMA public TO gracie_saas;

-- DATABASE_URL final (cole no secret do GitHub `DATABASE_URL`):
--   postgresql://gracie_saas:SENHA@postgres:5432/gracie_saas?schema=public
