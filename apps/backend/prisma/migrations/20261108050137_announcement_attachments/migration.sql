-- CreateTable
CREATE TABLE "announcement_attachments" (
    "id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "format" "DocumentFormat" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "announcement_attachments_storage_key_key" ON "announcement_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "announcement_attachments_announcement_id_idx" ON "announcement_attachments"("announcement_id");

-- AddForeignKey
ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
