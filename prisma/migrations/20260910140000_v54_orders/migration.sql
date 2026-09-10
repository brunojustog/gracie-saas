-- v54: encomendas (aluno pediu item sem estoque). Registro simples pra Gisele.
CREATE TYPE "OrderPaymentStatus" AS ENUM ('TO_PAY', 'PARTIAL', 'PAID');
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'FULFILLED', 'CANCELED');

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "customerName" TEXT,
    "size" TEXT,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'TO_PAY',
    "amount" DECIMAL(10,2),
    "notes" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Order_tenantId_status_orderedAt_idx" ON "Order"("tenantId", "status", "orderedAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
