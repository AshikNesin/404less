// Applies the app's migrations (apps/web/drizzle) to the test D1 database with
// the same function production uses on first request (groot's migrateD1).
import { env } from "cloudflare:test";
import { migrateD1 } from "@groot/core/database/d1";
import { migrations } from "../../apps/web/drizzle";

await migrateD1(env.DB as never, migrations);
