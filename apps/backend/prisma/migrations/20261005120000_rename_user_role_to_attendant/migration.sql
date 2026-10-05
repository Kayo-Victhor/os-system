-- Replace the ambiguous internal USER role with ATTENDANT while preserving
-- CUSTOMER as a temporary legacy role until CustomerAccount is introduced.
-- PostgreSQL cannot drop an enum value in place, so the enum is rebuilt and
-- every existing USER row is converted in the same column rewrite.
ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ATTENDANT', 'TECHNICIAN', 'CUSTOMER');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING (
    CASE
      WHEN "role"::text = 'USER' THEN 'ATTENDANT'
      ELSE "role"::text
    END
  )::"UserRole";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'ATTENDANT';

DROP TYPE "UserRole_old";
