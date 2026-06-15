/**
 * Run once to create/migrate all tables. Safe to re-run (CREATE IF NOT EXISTS).
 * Used by entrypoint.sh and: docker compose run --rm db-init
 */
import { closeDb, ensureDb } from "../server/db";

await ensureDb();
console.log("PostgreSQL ready — schema migrated");
await closeDb();
