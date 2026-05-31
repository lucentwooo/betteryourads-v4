import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

// Server-side Supabase client (service role — bypasses RLS). Used to verify
// user tokens and to write ads/storage on the user's behalf.
//
// Server-only. Module caching on the long-running Node host makes this a
// singleton across requests (the server.js module-level `supabaseAdmin`).
const url = SUPABASE_URL();
const key = SUPABASE_SERVICE_ROLE_KEY();

export const supabaseAdmin =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
