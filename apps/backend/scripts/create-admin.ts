import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "../src/config/index.js";

loadEnvFile(process.cwd());

const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error("Usage: npx tsx scripts/create-admin.ts <email> <password>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

(async () => {
  // Find an existing auth user with this email (createUser fails if already registered).
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  let userId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;

  if (userId) {
    // Reset the password so the known credentials work, and ensure the email is confirmed.
    const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) throw error;
    console.log(`Existing user ${email} updated (password reset).`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created user ${email}.`);
  }

  // Approve + grant admin. The signup trigger creates the row, but upsert covers any gap.
  const { error: profErr } = await admin
    .from("profiles")
    .upsert({ id: userId, email, approved: true, is_admin: true }, { onConflict: "id" });
  if (profErr) throw profErr;

  console.log(`Approved + admin set for ${email} (id ${userId}). You can sign in now.`);
  process.exit(0);
})().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
