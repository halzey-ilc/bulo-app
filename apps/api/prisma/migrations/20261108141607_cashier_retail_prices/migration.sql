-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CASHIER';

-- AlterTable
ALTER TABLE "PriceType" ADD COLUMN     "isRetail" BOOLEAN NOT NULL DEFAULT false;

-- Существующий тип «Розничная» становится розничным
UPDATE "PriceType" SET "isRetail" = true WHERE "name" = 'Розничная' OR "oneCId" = 'demo-retail';
