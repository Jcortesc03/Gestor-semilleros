-- Inscripciones (demo de importación desde Google Sheets)

CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "EnrollmentDocumentType" AS ENUM ('CC', 'TI');
CREATE TYPE "EnrollmentAreaType" AS ENUM ('SEEDLING', 'DEGREE_PROJECT');
CREATE TYPE "EnrollmentFaculty" AS ENUM ('SYSTEMS_ENGINEERING', 'SOFTWARE_ENGINEERING');

CREATE TABLE "enrollment_sources" (
    "area_id" UUID NOT NULL,
    "spreadsheet_id" TEXT NOT NULL,
    "range" TEXT NOT NULL,
    "area_type" "EnrollmentAreaType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_sources_pkey" PRIMARY KEY ("area_id"),
    CONSTRAINT "enrollment_sources_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "enrollment_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "area_id" UUID NOT NULL,
    "first_names" TEXT NOT NULL,
    "last_names" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "document_type" "EnrollmentDocumentType" NOT NULL,
    "document_number" TEXT NOT NULL,
    "faculty" "EnrollmentFaculty" NOT NULL,
    "area_type" "EnrollmentAreaType" NOT NULL,
    "period" TEXT NOT NULL,
    "consent" BOOLEAN NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "source_row" INTEGER,
    "source_spreadsheet_id" TEXT,
    "source_receipt_hash" TEXT,
    "rejected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enrollment_applications_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "enrollment_applications_area_id_period_document_type_document_number_key"
    ON "enrollment_applications"("area_id", "period", "document_type", "document_number");
CREATE INDEX "enrollment_applications_area_id_status_idx" ON "enrollment_applications"("area_id", "status");
CREATE INDEX "enrollment_applications_area_id_period_idx" ON "enrollment_applications"("area_id", "period");

CREATE TABLE "enrollment_import_tombstones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "area_id" UUID NOT NULL,
    "receipt_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_import_tombstones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enrollment_import_tombstones_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "enrollment_import_tombstones_area_id_receipt_hash_key"
    ON "enrollment_import_tombstones"("area_id", "receipt_hash");
