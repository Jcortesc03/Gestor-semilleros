-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('TUTOR', 'STUDENT', 'STUDENT_LEADER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('LINK', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('PDF', 'WORD', 'EXCEL', 'IMAGE');

-- CreateEnum
CREATE TYPE "AnnouncementKind" AS ENUM ('NEWS', 'COMMUNICATION', 'CHANGE', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('ALL', 'ROLE', 'FACULTY', 'AREA', 'PROJECT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area_managers" (
    "area_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "area_managers_pkey" PRIMARY KEY ("area_id","user_id")
);

-- CreateTable
CREATE TABLE "faculties" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_deans" (
    "id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),

    CONSTRAINT "faculty_deans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "area_id" UUID NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_on" DATE,
    "ends_on" DATE,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_faculties" (
    "project_id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,

    CONSTRAINT "project_faculties_pkey" PRIMARY KEY ("project_id","faculty_id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_role" "ProjectRole" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "progress_status" "ProgressStatus" NOT NULL DEFAULT 'PENDING',
    "result" "WorkResult",
    "responsible_tutor_id" UUID NOT NULL,
    "responsible_student_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "progress_status" "ProgressStatus" NOT NULL DEFAULT 'PENDING',
    "result" "WorkResult",
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_assignees" (
    "activity_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_assignees_pkey" PRIMARY KEY ("activity_id","user_id")
);

-- CreateTable
CREATE TABLE "activity_attachments" (
    "id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "url" TEXT,
    "document_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "format" "DocumentFormat" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "kind" "AnnouncementKind" NOT NULL DEFAULT 'NEWS',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_audiences" (
    "id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "audience_type" "AudienceType" NOT NULL,
    "role" "Role",
    "faculty_id" UUID,
    "area_id" UUID,
    "project_id" UUID,

    CONSTRAINT "announcement_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "organizer_id" UUID NOT NULL,
    "external_id" TEXT,
    "reason" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "join_url" TEXT,
    "recording_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "meeting_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("meeting_id","user_id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "project_id" UUID,
    "title" TEXT NOT NULL,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "areas_name_key" ON "areas"("name");

-- CreateIndex
CREATE INDEX "area_managers_user_id_idx" ON "area_managers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_name_key" ON "faculties"("name");

-- CreateIndex
CREATE INDEX "faculty_deans_faculty_id_idx" ON "faculty_deans"("faculty_id");

-- CreateIndex
CREATE INDEX "faculty_deans_user_id_idx" ON "faculty_deans"("user_id");

-- CreateIndex
CREATE INDEX "projects_area_id_idx" ON "projects"("area_id");

-- CreateIndex
CREATE INDEX "projects_deleted_at_idx" ON "projects"("deleted_at");

-- CreateIndex
CREATE INDEX "project_faculties_faculty_id_idx" ON "project_faculties"("faculty_id");

-- CreateIndex
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE INDEX "boards_project_id_idx" ON "boards"("project_id");

-- CreateIndex
CREATE INDEX "boards_deleted_at_idx" ON "boards"("deleted_at");

-- CreateIndex
CREATE INDEX "activities_board_id_idx" ON "activities"("board_id");

-- CreateIndex
CREATE INDEX "activities_deleted_at_idx" ON "activities"("deleted_at");

-- CreateIndex
CREATE INDEX "activity_assignees_user_id_idx" ON "activity_assignees"("user_id");

-- CreateIndex
CREATE INDEX "activity_attachments_activity_id_idx" ON "activity_attachments"("activity_id");

-- CreateIndex
CREATE INDEX "activity_attachments_document_id_idx" ON "activity_attachments"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");

-- CreateIndex
CREATE INDEX "documents_deleted_at_idx" ON "documents"("deleted_at");

-- CreateIndex
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at");

-- CreateIndex
CREATE INDEX "announcement_audiences_announcement_id_idx" ON "announcement_audiences"("announcement_id");

-- CreateIndex
CREATE INDEX "announcement_audiences_faculty_id_idx" ON "announcement_audiences"("faculty_id");

-- CreateIndex
CREATE INDEX "announcement_audiences_area_id_idx" ON "announcement_audiences"("area_id");

-- CreateIndex
CREATE INDEX "announcement_audiences_project_id_idx" ON "announcement_audiences"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_external_id_key" ON "meetings"("external_id");

-- CreateIndex
CREATE INDEX "meetings_project_id_idx" ON "meetings"("project_id");

-- CreateIndex
CREATE INDEX "meetings_starts_at_idx" ON "meetings"("starts_at");

-- CreateIndex
CREATE INDEX "meeting_participants_user_id_idx" ON "meeting_participants"("user_id");

-- CreateIndex
CREATE INDEX "reminders_created_by_id_idx" ON "reminders"("created_by_id");

-- CreateIndex
CREATE INDEX "reminders_remind_at_idx" ON "reminders"("remind_at");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_managers" ADD CONSTRAINT "area_managers_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_managers" ADD CONSTRAINT "area_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_deans" ADD CONSTRAINT "faculty_deans_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_deans" ADD CONSTRAINT "faculty_deans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_faculties" ADD CONSTRAINT "project_faculties_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_faculties" ADD CONSTRAINT "project_faculties_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_responsible_tutor_id_fkey" FOREIGN KEY ("responsible_tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_responsible_student_id_fkey" FOREIGN KEY ("responsible_student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_assignees" ADD CONSTRAINT "activity_assignees_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_assignees" ADD CONSTRAINT "activity_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_assignees" ADD CONSTRAINT "activity_assignees_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attachments" ADD CONSTRAINT "activity_attachments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attachments" ADD CONSTRAINT "activity_attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attachments" ADD CONSTRAINT "activity_attachments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_audiences" ADD CONSTRAINT "announcement_audiences_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_audiences" ADD CONSTRAINT "announcement_audiences_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_audiences" ADD CONSTRAINT "announcement_audiences_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_audiences" ADD CONSTRAINT "announcement_audiences_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Restricciones no expresables en schema.prisma
-- (docs/database/data-model.md §6). Mantener sincronizadas.
-- ─────────────────────────────────────────────────────────────

-- DB-03 / P-06: un único decano vigente por facultad.
CREATE UNIQUE INDEX "faculty_deans_one_current_per_faculty"
  ON "faculty_deans" ("faculty_id") WHERE "ends_at" IS NULL;

ALTER TABLE "faculty_deans" ADD CONSTRAINT "faculty_deans_valid_period"
  CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

-- DB-02 / P-25: un único registro activo por (proyecto, usuario).
CREATE UNIQUE INDEX "project_members_one_active_per_user_project"
  ON "project_members" ("project_id", "user_id") WHERE "status" = 'ACTIVE';

-- P-25: un estudiante solo puede tener un proyecto activo a la vez.
CREATE UNIQUE INDEX "project_members_one_active_project_per_student"
  ON "project_members" ("user_id")
  WHERE "status" = 'ACTIVE' AND "project_role" IN ('STUDENT', 'STUDENT_LEADER');

-- P-03: como máximo un estudiante líder activo por proyecto.
CREATE UNIQUE INDEX "project_members_one_active_leader_per_project"
  ON "project_members" ("project_id")
  WHERE "status" = 'ACTIVE' AND "project_role" = 'STUDENT_LEADER';

-- P-05: como máximo un tutor principal activo por proyecto.
CREATE UNIQUE INDEX "project_members_one_primary_tutor_per_project"
  ON "project_members" ("project_id")
  WHERE "status" = 'ACTIVE' AND "is_primary";

-- Solo los tutores pueden marcarse como principales.
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_primary_only_tutor"
  CHECK (NOT "is_primary" OR "project_role" = 'TUTOR');

-- Un participante inactivo tiene fecha de salida.
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_left_at_when_inactive"
  CHECK (("status" = 'ACTIVE') = ("left_at" IS NULL));

-- P-14: cada adjunto es un enlace o un documento, nunca ambos.
ALTER TABLE "activity_attachments" ADD CONSTRAINT "activity_attachments_kind_target"
  CHECK (
    ("kind" = 'LINK' AND "url" IS NOT NULL AND "document_id" IS NULL) OR
    ("kind" = 'DOCUMENT' AND "document_id" IS NOT NULL AND "url" IS NULL)
  );

-- P-12: la aprobación registra quién y cuándo.
ALTER TABLE "activities" ADD CONSTRAINT "activities_approval_consistency"
  CHECK (
    ("approval_status" = 'PENDING' AND "approved_by_id" IS NULL AND "approved_at" IS NULL) OR
    ("approval_status" <> 'PENDING' AND "approved_by_id" IS NOT NULL AND "approved_at" IS NOT NULL)
  );

-- RN-60: tamaño de documento positivo.
ALTER TABLE "documents" ADD CONSTRAINT "documents_size_positive"
  CHECK ("size_bytes" > 0);

-- DB-06: el destino de la audiencia corresponde a su tipo.
ALTER TABLE "announcement_audiences" ADD CONSTRAINT "announcement_audiences_target"
  CHECK (
    ("audience_type" = 'ALL'     AND num_nonnulls("role", "faculty_id", "area_id", "project_id") = 0) OR
    ("audience_type" = 'ROLE'    AND "role" IS NOT NULL       AND num_nonnulls("faculty_id", "area_id", "project_id") = 0) OR
    ("audience_type" = 'FACULTY' AND "faculty_id" IS NOT NULL AND num_nonnulls("role", "area_id", "project_id") = 0) OR
    ("audience_type" = 'AREA'    AND "area_id" IS NOT NULL    AND num_nonnulls("role", "faculty_id", "project_id") = 0) OR
    ("audience_type" = 'PROJECT' AND "project_id" IS NOT NULL AND num_nonnulls("role", "faculty_id", "area_id") = 0)
  );

-- DB-12: duración positiva.
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_duration_positive"
  CHECK ("duration_minutes" > 0);

-- Fechas coherentes del proyecto.
ALTER TABLE "projects" ADD CONSTRAINT "projects_valid_dates"
  CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "ends_on" >= "starts_on");
