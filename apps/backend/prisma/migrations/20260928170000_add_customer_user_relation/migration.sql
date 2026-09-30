-- A business customer can exist without a login account, but a CUSTOMER
-- account may be linked to at most one Customer record. Existing records are
-- intentionally not backfilled automatically: matching legacy data by email
-- could associate the wrong person and must be reviewed explicitly.
ALTER TABLE "Customer" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
