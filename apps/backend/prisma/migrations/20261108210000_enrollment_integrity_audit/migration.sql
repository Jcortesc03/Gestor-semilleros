ALTER TABLE "enrollment_sources" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "enrollment_applications_area_id_period_email_key"
    ON "enrollment_applications"("area_id", "period", "email");

CREATE TABLE "enrollment_audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "area_id" UUID,
    "action" TEXT NOT NULL,
    "affected_count" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enrollment_audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enrollment_audit_events_count_check" CHECK ("affected_count" >= 0)
);
CREATE INDEX "enrollment_audit_events_area_id_created_at_idx" ON "enrollment_audit_events"("area_id", "created_at");
ALTER TABLE "enrollment_audit_events" ADD CONSTRAINT "enrollment_audit_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "enrollment_audit_events" ADD CONSTRAINT "enrollment_audit_events_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
