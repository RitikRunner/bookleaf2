/*
  Warnings:

  - The `aiConfidence` column on the `Ticket` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "AiConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AiOperation" AS ENUM ('CLASSIFY', 'DRAFT');

-- CreateEnum
CREATE TYPE "EscalationTeam" AS ENUM ('NONE', 'FINANCE', 'PRODUCTION', 'DISTRIBUTION', 'PRINTING');

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "aiConfidence",
ADD COLUMN     "aiConfidence" "AiConfidence";

-- AlterTable
ALTER TABLE "TicketMessage" ADD COLUMN     "aiDraftId" TEXT,
ADD COLUMN     "draftEdited" BOOLEAN;

-- CreateTable
CREATE TABLE "AiDraft" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "adminNotes" TEXT[],
    "suggestedStatus" "TicketStatus" NOT NULL,
    "escalateTo" "EscalationTeam" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "operation" "AiOperation" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "ticketId" TEXT,
    "success" BOOLEAN NOT NULL,
    "errorType" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiDraft_ticketId_contextHash_idx" ON "AiDraft"("ticketId", "contextHash");

-- CreateIndex
CREATE INDEX "AiUsageLog_operation_createdAt_idx" ON "AiUsageLog"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_ticketId_idx" ON "AiUsageLog"("ticketId");

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_aiDraftId_fkey" FOREIGN KEY ("aiDraftId") REFERENCES "AiDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
