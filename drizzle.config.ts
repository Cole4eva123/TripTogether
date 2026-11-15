// drizzle-kit reads this to turn lib/db/schema.ts into SQL migrations under drizzle/ (npm run db:generate).
// The app applies them itself on first use, so there is no separate migrate step (lib/db/client.ts).
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
});
