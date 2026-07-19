-- CreateEnum
CREATE TYPE "AdminAlertType" AS ENUM ('CARRIER_EVENT_FAILED');

-- CreateTable
CREATE TABLE "AdminAlert" (
    "id" TEXT NOT NULL,
    "type" "AdminAlertType" NOT NULL,
    "storeId" TEXT NOT NULL,
    "packageId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "AdminAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAlert_resolvedAt_createdAt_idx" ON "AdminAlert"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAlert_storeId_idx" ON "AdminAlert"("storeId");

-- AddForeignKey
ALTER TABLE "AdminAlert" ADD CONSTRAINT "AdminAlert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAlert" ADD CONSTRAINT "AdminAlert_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAlert" ADD CONSTRAINT "AdminAlert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same posture as every other table: RLS on, no policies — only the
-- service-role connection (Prisma) can touch rows; anon/authenticated
-- Supabase keys see nothing.
ALTER TABLE "AdminAlert" ENABLE ROW LEVEL SECURITY;
