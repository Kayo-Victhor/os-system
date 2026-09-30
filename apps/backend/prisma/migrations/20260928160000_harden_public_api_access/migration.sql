-- The application uses Express + its own JWT for authorization. These tables
-- must not be reachable through Supabase's anon/authenticated PostgREST roles.
-- Prisma connects as postgres (BYPASSRLS), so normal backend and migration
-- operations continue to work while external roles are denied by both grants
-- and RLS' default-deny behavior.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL PRIVILEGES ON TABLE
            public."User",
            public."Customer",
            public."ServiceOrder",
            public."RefreshToken",
            public."_prisma_migrations"
        FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL PRIVILEGES ON TABLE
            public."User",
            public."Customer",
            public."ServiceOrder",
            public."RefreshToken",
            public."_prisma_migrations"
        FROM authenticated;
    END IF;
END $$;

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ServiceOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- No policies are intentionally created. anon and authenticated have no
-- direct data path in this architecture. Do not FORCE RLS: postgres has
-- BYPASSRLS and is the administrative Prisma/migration connection.

-- Prevent future Prisma-created tables and sequences in public from inheriting
-- the broad Supabase defaults currently granted to anon/authenticated.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
            REVOKE ALL ON TABLES FROM anon;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
            REVOKE ALL ON SEQUENCES FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
            REVOKE ALL ON TABLES FROM authenticated;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
            REVOKE ALL ON SEQUENCES FROM authenticated;
    END IF;
END $$;
