-- Reuniones con Microsoft Teams y avisos de reuniones en la bandeja de salida (ADR 0007).

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('NEWS', 'COMMUNICATION', 'CHANGE', 'NOTIFICATION', 'MEETING');

-- CreateEnum
CREATE TYPE "DispatchPurpose" AS ENUM ('ANNOUNCEMENT', 'MEETING_INVITATION', 'MEETING_REMINDER', 'MEETING_CANCELLATION');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED';

-- AlterTable
ALTER TABLE "notification_dispatches" ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "meeting_id" UUID,
ADD COLUMN     "purpose" "DispatchPurpose" NOT NULL DEFAULT 'ANNOUNCEMENT',
ADD COLUMN     "scheduled_for" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "announcement_id" DROP NOT NULL,
-- Conserva los datos: los valores de AnnouncementKind existen en NotificationKind.
ALTER COLUMN "kind" TYPE "NotificationKind" USING ("kind"::text::"NotificationKind");

-- AlterTable
-- Conserva las preferencias guardadas (la clave primaria no cambia de columnas).
ALTER TABLE "notification_preferences"
ALTER COLUMN "kind" TYPE "NotificationKind" USING ("kind"::text::"NotificationKind");

-- CreateTable
CREATE TABLE "microsoft_accounts" (
    "user_id" UUID NOT NULL,
    "microsoft_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "access_token_expires_at" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "microsoft_accounts_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "microsoft_accounts_microsoft_user_id_key" ON "microsoft_accounts"("microsoft_user_id");

-- CreateIndex
CREATE INDEX "meetings_status_idx" ON "meetings"("status");

-- CreateIndex
CREATE INDEX "notification_dispatches_meeting_id_idx" ON "notification_dispatches"("meeting_id");

-- AddForeignKey
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "microsoft_accounts" ADD CONSTRAINT "microsoft_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones que Prisma no expresa (ADR 0007).
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_one_source"
  CHECK (("announcement_id" IS NOT NULL) <> ("meeting_id" IS NOT NULL));
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_purpose_source"
  CHECK (("purpose" = 'ANNOUNCEMENT') = ("announcement_id" IS NOT NULL));
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_cancelled_at_matches_status"
  CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));
