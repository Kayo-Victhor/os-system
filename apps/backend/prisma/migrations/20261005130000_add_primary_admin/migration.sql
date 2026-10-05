ALTER TABLE "User" ADD COLUMN "isPrimaryAdmin" BOOLEAN NOT NULL DEFAULT false;

-- The historical seed identified its bootstrap administrator by this fixed
-- address. Promote that exact existing ADMIN without recreating its record.
DO $$
DECLARE
  primary_admin_count INTEGER;
  legacy_bootstrap_id TEXT;
BEGIN
  SELECT COUNT(*) INTO primary_admin_count
  FROM "User"
  WHERE "isPrimaryAdmin" = true;

  IF primary_admin_count > 1 THEN
    RAISE EXCEPTION 'Multiple primary administrators found';
  END IF;

  IF primary_admin_count = 0 THEN
    SELECT "id" INTO legacy_bootstrap_id
    FROM "User"
    WHERE "email" = 'admin@os-system.local'
      AND "role" = 'ADMIN';

    IF legacy_bootstrap_id IS NOT NULL THEN
      UPDATE "User"
      SET "isPrimaryAdmin" = true
      WHERE "id" = legacy_bootstrap_id;
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX "User_single_primary_admin_idx"
ON "User" ("isPrimaryAdmin")
WHERE "isPrimaryAdmin" = true;
