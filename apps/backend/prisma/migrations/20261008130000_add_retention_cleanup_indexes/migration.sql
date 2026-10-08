-- Support bounded retention cleanup without scanning complete authentication tables.
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
CREATE INDEX "RefreshToken_revokedAt_idx" ON "RefreshToken"("revokedAt");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE INDEX "PasswordResetToken_usedAt_idx" ON "PasswordResetToken"("usedAt");
CREATE INDEX "CustomerSession_revokedAt_idx" ON "CustomerSession"("revokedAt");
CREATE INDEX "CustomerSessionRefreshToken_consumedAt_idx" ON "CustomerSessionRefreshToken"("consumedAt");
CREATE INDEX "CustomerAccountPasswordResetToken_usedAt_idx" ON "CustomerAccountPasswordResetToken"("usedAt");
