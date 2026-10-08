-- Persist public transactional e-mail delivery independently from the HTTP
-- request. No existing business data is rewritten by this migration.
CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
CREATE TYPE "EmailOutboxType" AS ENUM (
    'CUSTOMER_REGISTRATION_VERIFICATION',
    'CUSTOMER_PASSWORD_RESET',
    'INTERNAL_PASSWORD_RESET'
);

CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "type" "EmailOutboxType" NOT NULL,
    "recipient" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "deduplicationKey" TEXT NOT NULL,
    "relatedEntityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailOutbox_deduplicationKey_key"
ON "EmailOutbox"("deduplicationKey");

CREATE INDEX "EmailOutbox_status_availableAt_idx"
ON "EmailOutbox"("status", "availableAt");

CREATE INDEX "EmailOutbox_type_relatedEntityId_idx"
ON "EmailOutbox"("type", "relatedEntityId");

-- The outbox contains recipient addresses and one-time delivery material. It
-- is backend-only: RLS is defense in depth and Data API roles have no grants.
ALTER TABLE public."EmailOutbox" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL PRIVILEGES ON TABLE public."EmailOutbox" FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL PRIVILEGES ON TABLE public."EmailOutbox" FROM authenticated;
    END IF;
END $$;
