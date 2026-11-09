-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('PARTNER', 'CAFE');

-- AlterEnum
ALTER TYPE "OneCDocType" ADD VALUE 'CANCEL';

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_partnerId_fkey";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "promoCoffee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "section" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'PARTNER',
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "freeCoffees" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentClaimedAt" TIMESTAMP(3),
ADD COLUMN     "pickupAt" TIMESTAMP(3),
ADD COLUMN     "receiptUrl" TEXT,
ALTER COLUMN "partnerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "freeQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bankBik" TEXT,
ADD COLUMN     "bankInn" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankRecipient" TEXT,
ADD COLUMN     "promoEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "promoEvery" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "qrPayload" TEXT,
ADD COLUMN     "qrWithAmount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workshopWarehouseId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "opensAt" TEXT NOT NULL DEFAULT '08:00',
    "closesAt" TEXT NOT NULL DEFAULT '22:00',
    "priceTypeId" TEXT NOT NULL,
    "oneCWarehouseId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("productId","warehouseId")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "imageUrl" TEXT NOT NULL,
    "productId" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_priceTypeId_key" ON "Branch"("priceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_oneCWarehouseId_key" ON "Branch"("oneCWarehouseId");

-- CreateIndex
CREATE INDEX "Order_channel_status_idx" ON "Order"("channel", "status");

-- CreateIndex
CREATE INDEX "Order_createdById_idx" ON "Order"("createdById");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_priceTypeId_fkey" FOREIGN KEY ("priceTypeId") REFERENCES "PriceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
