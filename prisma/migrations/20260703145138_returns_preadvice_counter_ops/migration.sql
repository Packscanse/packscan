-- CreateEnum
CREATE TYPE "PreAdviceStatus" AS ENUM ('ANNOUNCED', 'RECEIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PackageStatus" ADD VALUE 'RETURN_PENDING';
ALTER TYPE "PackageStatus" ADD VALUE 'RETURNED_TO_CARRIER';

-- AlterTable
ALTER TABLE "HandoverVerification" ADD COLUMN     "override" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overrideReason" TEXT;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "shelfLocation" TEXT;

-- AlterTable
ALTER TABLE "ScanEvent" ADD COLUMN     "courierRef" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "pickupDeadlineDays" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "PreAdvice" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "carrier" "Carrier" NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "status" "PreAdviceStatus" NOT NULL DEFAULT 'ANNOUNCED',
    "announcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "packageId" TEXT,

    CONSTRAINT "PreAdvice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreAdvice_packageId_key" ON "PreAdvice"("packageId");

-- CreateIndex
CREATE INDEX "PreAdvice_storeId_status_idx" ON "PreAdvice"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PreAdvice_storeId_trackingNumber_key" ON "PreAdvice"("storeId", "trackingNumber");

-- AddForeignKey
ALTER TABLE "PreAdvice" ADD CONSTRAINT "PreAdvice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAdvice" ADD CONSTRAINT "PreAdvice_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deny-all RLS, matching every other table (see 20260702221608).
ALTER TABLE "PreAdvice" ENABLE ROW LEVEL SECURITY;
