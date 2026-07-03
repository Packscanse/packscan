/*
  Warnings:

  - You are about to drop the column `codeVerified` on the `HandoverVerification` table. All the data in the column will be lost.
  - You are about to drop the column `pickupCode` on the `Package` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "HandoverVerification" DROP COLUMN "codeVerified",
ADD COLUMN     "presentedCode" TEXT;

-- AlterTable
ALTER TABLE "Package" DROP COLUMN "pickupCode";
