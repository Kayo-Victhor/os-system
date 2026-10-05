-- Public registration is persisted separately until e-mail ownership is
-- confirmed. No legacy User, Customer or CustomerAccount data is migrated.
CREATE TABLE "PendingCustomerRegistration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "document" TEXT,
    "address" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingCustomerRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PendingCustomerRegistrationToken" (
    "id" TEXT NOT NULL,
    "pendingRegistrationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingCustomerRegistrationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingCustomerRegistration_email_key"
ON "PendingCustomerRegistration"("email");

CREATE INDEX "PendingCustomerRegistration_expiresAt_idx"
ON "PendingCustomerRegistration"("expiresAt");

CREATE UNIQUE INDEX "PendingCustomerRegistrationToken_pendingRegistrationId_key"
ON "PendingCustomerRegistrationToken"("pendingRegistrationId");

CREATE UNIQUE INDEX "PendingCustomerRegistrationToken_tokenHash_key"
ON "PendingCustomerRegistrationToken"("tokenHash");

CREATE INDEX "PendingCustomerRegistrationToken_expiresAt_idx"
ON "PendingCustomerRegistrationToken"("expiresAt");

ALTER TABLE "PendingCustomerRegistrationToken"
ADD CONSTRAINT "PendingCustomerRegistrationToken_pendingRegistrationId_fkey"
FOREIGN KEY ("pendingRegistrationId") REFERENCES "PendingCustomerRegistration"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- The application talks to these credential tables only through Express and
-- Prisma. Supabase Data API roles have no direct access and no public policy.
ALTER TABLE public."PendingCustomerRegistration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PendingCustomerRegistrationToken" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL PRIVILEGES ON TABLE
            public."PendingCustomerRegistration",
            public."PendingCustomerRegistrationToken"
        FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL PRIVILEGES ON TABLE
            public."PendingCustomerRegistration",
            public."PendingCustomerRegistrationToken"
        FROM authenticated;
    END IF;
END $$;
