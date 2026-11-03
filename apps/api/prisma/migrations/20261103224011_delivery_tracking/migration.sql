-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "entrance" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryCode" TEXT,
ADD COLUMN     "deliveryEntrance" TEXT,
ADD COLUMN     "deliveryLat" DOUBLE PRECISION,
ADD COLUMN     "deliveryLng" DOUBLE PRECISION,
ADD COLUMN     "receivedBy" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "bakeryLat" DOUBLE PRECISION NOT NULL DEFAULT 42.8746,
ADD COLUMN     "bakeryLng" DOUBLE PRECISION NOT NULL DEFAULT 74.5698;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onShiftSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CourierPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourierPosition_userId_createdAt_idx" ON "CourierPosition"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CourierPosition" ADD CONSTRAINT "CourierPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
