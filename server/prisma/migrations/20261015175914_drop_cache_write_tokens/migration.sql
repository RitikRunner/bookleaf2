/*
  Warnings:

  - You are about to drop the column `cacheWriteTokens` on the `AiUsageLog` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AiUsageLog" DROP COLUMN "cacheWriteTokens";
