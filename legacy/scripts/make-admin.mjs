// One-off: create (or update) admin@betteryourads.dev as an approved admin.
// Uses the service-role key (bypasses RLS). Run: node scripts/make-admin.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Minimal .env reader (same spirit as server.js loadEnv): strip quotes/spaces.
const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[m[1]] = v;
}

const EMAIL = "admin@betteryourads.dev";
const PASSWORD = "Lucent3108!";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1) Find an existing user with this email, else create one (email pre-confirmed).
async function findUser() {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === EMAIL);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}

let user = await findUser();
if (user) {
  // Ensure the password matches what was requested and the email is confirmed.
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  user = data.user;
  console.log("Updated existing user:", user.id);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  user = data.user;
  console.log("Created user:", user.id);
}

// 2) Upsert the profile row as approved admin (trigger may have made a default one).
const { error: upErr } = await admin
  .from("profiles")
  .upsert({ id: user.id, email: EMAIL, approved: true, is_admin: true }, { onConflict: "id" });
if (upErr) throw upErr;

// 3) Verify.
const { data: prof, error: selErr } = await admin
  .from("profiles")
  .select("id,email,approved,is_admin")
  .eq("id", user.id)
  .single();
if (selErr) throw selErr;

console.log("Profile:", prof);
if (prof.approved && prof.is_admin) {
  console.log("\n✅ Done — admin@betteryourads.dev is an approved admin.");
} else {
  console.log("\n❌ Profile flags not set as expected.");
  process.exit(1);
}
