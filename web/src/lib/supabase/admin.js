import { createClient } from "@supabase/supabase-js";

// SERVICE ROLE key - bypasses RLS and can create/delete real login accounts.
// Import this ONLY in Route Handlers (src/app/api/**/route.js), never in a
// Server Component, Client Component, or anything that could ship to the
// browser. SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix, so Next.js
// already refuses to expose it client-side, but treat that as a backstop,
// not the only safeguard.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
