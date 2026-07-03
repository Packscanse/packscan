-- CreateEnum
CREATE TYPE "IdType" AS ENUM ('PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID', 'OTHER');

-- DropForeignKey
ALTER TABLE "ScanEvent" DROP CONSTRAINT "ScanEvent_packageId_fkey";

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "pickupCode" TEXT;

-- AlterTable
ALTER TABLE "ScanEvent" ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "HandoverVerification" (
    "id" TEXT NOT NULL,
    "scanEventId" TEXT NOT NULL,
    "codeVerified" BOOLEAN NOT NULL DEFAULT false,
    "idChecked" BOOLEAN NOT NULL DEFAULT false,
    "idType" "IdType",
    "collectorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoverVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HandoverVerification_scanEventId_key" ON "HandoverVerification"("scanEventId");

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverVerification" ADD CONSTRAINT "HandoverVerification_scanEventId_fkey" FOREIGN KEY ("scanEventId") REFERENCES "ScanEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all RLS, matching every other table (see 20260702221608): access goes
-- through Prisma as table owner; this closes hosted-Postgres REST exposure.
ALTER TABLE "HandoverVerification" ENABLE ROW LEVEL SECURITY;
