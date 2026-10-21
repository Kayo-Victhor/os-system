-- Existing orders remain explicitly outside SLA monitoring. New orders receive
-- both values atomically in the application, and priority changes recalculate
-- them from the original creation timestamp.
ALTER TABLE "ServiceOrder"
ADD COLUMN "resolutionSlaMinutes" INTEGER,
ADD COLUMN "resolutionDueAt" TIMESTAMP(3);

ALTER TABLE "ServiceOrder"
ADD CONSTRAINT "ServiceOrder_resolution_sla_consistency_check"
CHECK (
    ("resolutionSlaMinutes" IS NULL AND "resolutionDueAt" IS NULL)
    OR
    ("resolutionSlaMinutes" > 0 AND "resolutionDueAt" IS NOT NULL)
);
