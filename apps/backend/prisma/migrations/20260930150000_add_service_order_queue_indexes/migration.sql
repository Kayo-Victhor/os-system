-- CreateIndex
CREATE INDEX "ServiceOrder_customerId_createdAt_idx" ON "ServiceOrder"("customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ServiceOrder_technicianId_createdAt_idx" ON "ServiceOrder"("technicianId", "createdAt" DESC);
