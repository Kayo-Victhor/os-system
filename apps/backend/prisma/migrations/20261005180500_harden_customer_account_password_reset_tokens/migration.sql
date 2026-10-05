-- Customer password-reset credentials are private to Express/Prisma. They are
-- never exposed directly through Supabase Data API roles.
ALTER TABLE public."CustomerAccountPasswordResetToken" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL PRIVILEGES ON TABLE
            public."CustomerAccountPasswordResetToken"
        FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL PRIVILEGES ON TABLE
            public."CustomerAccountPasswordResetToken"
        FROM authenticated;
    END IF;
END $$;
