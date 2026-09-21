// Prisma 7 removed `url` from the schema's datasource block: the CLI reads the
// connection string from here instead. It also stopped loading .env on its own,
// hence dotenv — a no-op in containers, where the variables are already set.
//
// The production image ships this file, the schema and a minimal Prisma CLI
// under /app/migrator so that `dotenv/config` resolves. See the Dockerfile.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
