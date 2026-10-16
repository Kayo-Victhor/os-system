CREATE TYPE "ServiceOrderEventType" AS ENUM (
    'CREATED',
    'OPERATIONAL_UPDATED',
    'STATUS_CHANGED',
    'TECHNICIAN_ASSIGNED',
    'TECHNICIAN_REASSIGNED',
    'TECHNICIAN_UNASSIGNED'
);

CREATE TABLE "ServiceOrderEvent" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "ServiceOrderEventType" NOT NULL,
    "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "previousStatus" "ServiceOrderStatus",
    "newStatus" "ServiceOrderStatus",
    "previousPriority" "ServiceOrderPriority",
    "newPriority" "ServiceOrderPriority",
    "previousTechnicianId" TEXT,
    "newTechnicianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceOrderEvent_serviceOrderId_createdAt_id_idx"
ON "ServiceOrderEvent"("serviceOrderId", "createdAt", "id");

CREATE INDEX "ServiceOrderEvent_actorId_idx"
ON "ServiceOrderEvent"("actorId");

ALTER TABLE "ServiceOrderEvent"
ADD CONSTRAINT "ServiceOrderEvent_serviceOrderId_fkey"
FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceOrderEvent"
ADD CONSTRAINT "ServiceOrderEvent_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Events are backend-only operational records. Customer-facing projections
-- are filtered by the Express API and Data API roles receive no privileges.
ALTER TABLE public."ServiceOrderEvent" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL PRIVILEGES ON TABLE public."ServiceOrderEvent" FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL PRIVILEGES ON TABLE public."ServiceOrderEvent" FROM authenticated;
    END IF;
END $$;
