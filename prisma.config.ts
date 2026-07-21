import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use a direct/session connection for migrations; the app can use a pooled URL.
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
});
