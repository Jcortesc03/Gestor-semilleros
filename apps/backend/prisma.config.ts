// Configuración de Prisma CLI (Prisma 7).
// Las variables de entorno no se cargan automáticamente: se leen de apps/backend/.env.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
