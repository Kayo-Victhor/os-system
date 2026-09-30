-- Add real email-ownership verification for public accounts. Existing users are
-- considered verified to preserve access established before this feature.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "emailVerifiedAt" IS NULL;

-- One verification credential per user. Reissuing replaces its hash and makes
-- every previously sent link unusable without retaining raw tokens.
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE UNIQUE INDEX "EmailVerificationToken_userId_key" ON "EmailVerificationToken"("userId");

ALTER TABLE "EmailVerificationToken"
ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- The frontend never accesses Supabase directly. Keep this sensitive table
-- inaccessible to PostgREST roles even if grants are changed accidentally.
ALTER TABLE public."EmailVerificationToken" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL PRIVILEGES ON TABLE public."EmailVerificationToken" FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL PRIVILEGES ON TABLE public."EmailVerificationToken" FROM authenticated;
    END IF;
END $$;
