CREATE TABLE "ServiceOrderNote" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceOrderNote_serviceOrderId_createdAt_id_idx"
ON "ServiceOrderNote"("serviceOrderId", "createdAt" DESC, "id" DESC);

CREATE INDEX "ServiceOrderNote_authorId_idx"
ON "ServiceOrderNote"("authorId");

ALTER TABLE "ServiceOrderNote"
ADD CONSTRAINT "ServiceOrderNote_serviceOrderId_fkey"
FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceOrderNote"
ADD CONSTRAINT "ServiceOrderNote_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Internal notes are backend-only records and are never projected to the
-- customer portal. Data API roles receive no direct privileges.
ALTER TABLE public."ServiceOrderNote" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL PRIVILEGES ON TABLE public."ServiceOrderNote" FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL PRIVILEGES ON TABLE public."ServiceOrderNote" FROM authenticated;
    END IF;
END $$;
