import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Use this in Server Components, Server Actions, and Route Handlers.
// `cookies()` is async in Next.js 15+ (Async Request APIs).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render, where cookies can't
            // be written - harmless as long as proxy.js also refreshes
            // the session (it does).
          }
        },
      },
    }
  );
}
