-- AlterTable
ALTER TABLE "LlmApiKey" ADD COLUMN "loginEmail" TEXT;
ALTER TABLE "LlmApiKey" ADD COLUMN "loginPassword" TEXT;
ALTER TABLE "LlmApiKey" ADD COLUMN "subscriptionPlan" TEXT;