import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// 1. Buckets (idempotent).
for (const name of ["logos", "inspiration", "creatives"]) {
  const { error } = await sb.storage.createBucket(name, { public: true });
  if (error && !/already exists/i.test(error.message))
    console.warn(`bucket ${name}: ${error.message}`);
  else console.log(`bucket ${name}: ok`);
}

// 2. Schema (only if a DB connection string is provided).
const dbUrl = process.env.SUPABASE_DB_URL;
const sqlPath = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "0001_initial.sql",
);
if (dbUrl) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(readFileSync(sqlPath, "utf8"));
    console.log("schema applied via SUPABASE_DB_URL");
  } catch (err) {
    if (/already exists/i.test(err.message)) {
      console.log("schema already present — skipping");
    } else {
      console.error(`schema apply failed: ${err.message}`);
      console.log(`\nApply the schema manually:`);
      console.log(`  1. Open Supabase dashboard -> SQL Editor`);
      console.log(`  2. Paste the contents of ${sqlPath} and run it.`);
    }
  } finally {
    await client.end();
  }
} else {
  console.log(`\nSUPABASE_DB_URL not set — apply the schema once manually:`);
  console.log(`  1. Open Supabase dashboard -> SQL Editor`);
  console.log(`  2. Paste the contents of ${sqlPath} and run it.`);
}
