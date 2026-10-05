-- CreateTable
CREATE TABLE "CustomerAccountPasswordResetToken" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAccountPasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccountPasswordResetToken_customerAccountId_key" ON "CustomerAccountPasswordResetToken"("customerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccountPasswordResetToken_tokenHash_key" ON "CustomerAccountPasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerAccountPasswordResetToken_expiresAt_idx" ON "CustomerAccountPasswordResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "CustomerAccountPasswordResetToken" ADD CONSTRAINT "CustomerAccountPasswordResetToken_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
