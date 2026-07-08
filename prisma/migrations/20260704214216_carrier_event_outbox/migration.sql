-- CreateEnum
CREATE TYPE "CarrierEventType" AS ENUM ('ARRIVAL', 'PICKED_UP', 'ACCEPTED_OUTBOUND', 'RETURNED');

-- CreateEnum
CREATE TYPE "CarrierEventStatus" AS ENUM ('PENDING', 'SENT', 'NOT_CONFIGURED', 'FAILED');

-- CreateTable
CREATE TABLE "CarrierEventOutbox" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "carrier" "Carrier" NOT NULL,
    "eventType" "CarrierEventType" NOT NULL,
    "payload" JSONB,
    "status" "CarrierEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "CarrierEventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarrierEventOutbox_status_nextAttemptAt_idx" ON "CarrierEventOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CarrierEventOutbox_packageId_idx" ON "CarrierEventOutbox"("packageId");

-- AddForeignKey
ALTER TABLE "CarrierEventOutbox" ADD CONSTRAINT "CarrierEventOutbox_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all RLS, matching every other table (see 20260702221608).
ALTER TABLE "CarrierEventOutbox" ENABLE ROW LEVEL SECURITY;
