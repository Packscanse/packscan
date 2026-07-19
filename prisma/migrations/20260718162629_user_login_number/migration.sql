-- AlterTable
ALTER TABLE "User" ADD COLUMN "loginNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_loginNumber_key" ON "User"("loginNumber");
