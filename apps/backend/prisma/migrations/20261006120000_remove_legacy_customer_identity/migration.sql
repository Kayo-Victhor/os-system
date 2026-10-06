-- Remove the legacy customer identity from the internal User domain.
-- Customer and ServiceOrder records are preserved. If an inconsistent legacy
-- User is referenced by a ServiceOrder, abort instead of rewriting history or
-- weakening a foreign key implicitly.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "ServiceOrder" service_order
        JOIN "User" legacy_user
          ON legacy_user."id" = service_order."createdById"
          OR legacy_user."id" = service_order."technicianId"
        WHERE legacy_user."role" = 'CUSTOMER'
    ) THEN
        RAISE EXCEPTION
            'Cannot remove legacy CUSTOMER users: at least one ServiceOrder still references one';
    END IF;
END $$;

-- RefreshToken, PasswordResetToken and EmailVerificationToken rows owned by
-- these identities are removed by their ON DELETE CASCADE constraints.
-- Customer.userId is set to NULL by its existing ON DELETE SET NULL FK, so
-- the customer record itself remains intact.
DELETE FROM "User" WHERE "role" = 'CUSTOMER';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "User" WHERE "role" = 'CUSTOMER') THEN
        RAISE EXCEPTION 'Legacy CUSTOMER users remain after cleanup';
    END IF;
END $$;

-- The verification table and marker applied only to legacy User(CUSTOMER).
-- Customer registration verification remains in the separate pending
-- registration and CustomerAccount domain.
DROP TABLE "EmailVerificationToken";
ALTER TABLE "User" DROP COLUMN "emailVerifiedAt";

-- Remove the last structural link between Customer and internal User.
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_userId_fkey";
DROP INDEX IF EXISTS "Customer_userId_key";
ALTER TABLE "Customer" DROP COLUMN "userId";

-- PostgreSQL cannot remove an enum value in place. Rebuild the type only
-- after every legacy row has been removed.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "UserRole" RENAME TO "UserRole_legacy";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ATTENDANT', 'TECHNICIAN');

ALTER TABLE "User"
    ALTER COLUMN "role" TYPE "UserRole"
    USING ("role"::text::"UserRole");

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'ATTENDANT';
DROP TYPE "UserRole_legacy";
