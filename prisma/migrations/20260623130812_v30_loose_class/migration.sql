-- CreateTable
CREATE TABLE "LooseClass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "modalityId" TEXT,
    "value" DECIMAL(10,2) NOT NULL,
    "classDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "soldById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LooseClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LooseClass_tenantId_classDate_idx" ON "LooseClass"("tenantId", "classDate");

-- CreateIndex
CREATE INDEX "LooseClass_leadId_idx" ON "LooseClass"("leadId");

-- AddForeignKey
ALTER TABLE "LooseClass" ADD CONSTRAINT "LooseClass_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LooseClass" ADD CONSTRAINT "LooseClass_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LooseClass" ADD CONSTRAINT "LooseClass_modalityId_fkey" FOREIGN KEY ("modalityId") REFERENCES "Modality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LooseClass" ADD CONSTRAINT "LooseClass_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
