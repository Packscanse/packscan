-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('SV', 'EN', 'DE', 'NL', 'NO', 'DA', 'FI');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" "Locale" NOT NULL DEFAULT 'EN';
