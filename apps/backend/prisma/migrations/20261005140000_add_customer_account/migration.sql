-- Customer access identity is intentionally separate from internal User.
-- No legacy User(CUSTOMER) records are reconciled in this migration.
CREATE TYPE "CustomerAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "status" "CustomerAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerAccount_customerId_key" ON "CustomerAccount"("customerId");
CREATE UNIQUE INDEX "CustomerAccount_email_key" ON "CustomerAccount"("email");

ALTER TABLE "CustomerAccount"
ADD CONSTRAINT "CustomerAccount_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CustomerAccount contains authentication credentials. The application uses
-- its Express backend and Prisma connection, never Supabase Data API roles.
ALTER TABLE public."CustomerAccount" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL PRIVILEGES ON TABLE public."CustomerAccount" FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL PRIVILEGES ON TABLE public."CustomerAccount" FROM authenticated;
    END IF;
END $$;
