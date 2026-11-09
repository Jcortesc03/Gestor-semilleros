-- CreateEnum
CREATE TYPE "MicrosoftAccountType" AS ENUM ('WORK_OR_SCHOOL', 'PERSONAL');

-- AlterTable
ALTER TABLE "microsoft_accounts" ADD COLUMN     "account_type" "MicrosoftAccountType" NOT NULL DEFAULT 'WORK_OR_SCHOOL';
