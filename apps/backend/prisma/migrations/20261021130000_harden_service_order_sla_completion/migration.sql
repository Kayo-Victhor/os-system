-- The pg adapter has historically persisted ServiceOrder SLA deadlines as UTC
-- wall-clock values in TIMESTAMP(3). Attach the UTC offset while converting the
-- column so the represented instants do not shift.
ALTER TABLE "ServiceOrder"
ALTER COLUMN "resolutionDueAt" TYPE TIMESTAMPTZ(3)
USING "resolutionDueAt" AT TIME ZONE 'UTC';

-- Completion is intentionally not backfilled. Legacy completed orders have no
-- trustworthy completion instant and therefore remain UNTRACKED.
ALTER TABLE "ServiceOrder"
ADD COLUMN "completedAt" TIMESTAMPTZ(3);

ALTER TABLE "ServiceOrder"
ADD CONSTRAINT "ServiceOrder_completed_at_status_check"
CHECK ("completedAt" IS NULL OR "status" = 'COMPLETED');
