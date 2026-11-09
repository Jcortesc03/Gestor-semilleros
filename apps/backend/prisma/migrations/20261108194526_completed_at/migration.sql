-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "completed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "boards" ADD COLUMN     "completed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "activities_completed_at_idx" ON "activities"("completed_at");

-- CreateIndex
CREATE INDEX "boards_completed_at_idx" ON "boards"("completed_at");

-- Backfill: los tableros y actividades ya terminados toman su última modificación como momento de terminación (aproximación).
UPDATE "boards" SET "completed_at" = "updated_at" WHERE "progress_status" = 'DONE';
UPDATE "activities" SET "completed_at" = "updated_at" WHERE "progress_status" = 'DONE';
