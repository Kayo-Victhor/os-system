-- Customer authentication sessions are deliberately isolated from the
-- legacy User/RefreshToken authentication domain.
CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerSessionRefreshToken" (
    "id" TEXT NOT NULL,
    "customerSessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSessionRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerSessionRefreshToken_tokenHash_key"
ON "CustomerSessionRefreshToken"("tokenHash");

CREATE INDEX "CustomerSession_customerAccountId_idx"
ON "CustomerSession"("customerAccountId");

CREATE INDEX "CustomerSession_expiresAt_idx"
ON "CustomerSession"("expiresAt");

CREATE INDEX "CustomerSession_customerAccountId_revokedAt_idx"
ON "CustomerSession"("customerAccountId", "revokedAt");

CREATE INDEX "CustomerSessionRefreshToken_customerSessionId_idx"
ON "CustomerSessionRefreshToken"("customerSessionId");

CREATE INDEX "CustomerSessionRefreshToken_expiresAt_idx"
ON "CustomerSessionRefreshToken"("expiresAt");

ALTER TABLE "CustomerSession"
ADD CONSTRAINT "CustomerSession_customerAccountId_fkey"
FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerSessionRefreshToken"
ADD CONSTRAINT "CustomerSessionRefreshToken_customerSessionId_fkey"
FOREIGN KEY ("customerSessionId") REFERENCES "CustomerSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- These tables are backend-only. RLS is defense in depth and public Data API
-- roles receive no table privileges or permissive policies.
ALTER TABLE "CustomerSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerSessionRefreshToken" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL PRIVILEGES ON TABLE "CustomerSession" FROM anon;
        REVOKE ALL PRIVILEGES ON TABLE "CustomerSessionRefreshToken" FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL PRIVILEGES ON TABLE "CustomerSession" FROM authenticated;
        REVOKE ALL PRIVILEGES ON TABLE "CustomerSessionRefreshToken" FROM authenticated;
    END IF;
END $$;
