ALTER TABLE "users" ADD COLUMN "password_reset_at" TIMESTAMP(3);

CREATE TABLE "password_recoveries" (
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "reset_token_hash" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    CONSTRAINT "password_recoveries_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "password_recoveries_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5)
);
CREATE UNIQUE INDEX "password_recoveries_reset_token_hash_key" ON "password_recoveries"("reset_token_hash");
ALTER TABLE "password_recoveries" ADD CONSTRAINT "password_recoveries_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
