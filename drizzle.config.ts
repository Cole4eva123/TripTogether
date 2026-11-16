import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "postgresql", schema: "./lib/lobby-schema.ts", out: "./drizzle" });
