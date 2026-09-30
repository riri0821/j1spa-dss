import { createBrowserClient } from "@supabase/ssr";

// Use this in Client Components ("use client"). Session lives in cookies
// (not localStorage), so the server can read it too - see server.js.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
