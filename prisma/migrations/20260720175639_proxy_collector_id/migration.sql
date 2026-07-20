-- AlterTable
ALTER TABLE "HandoverVerification" ADD COLUMN     "collectorIdChecked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "collectorIdType" "IdType";
