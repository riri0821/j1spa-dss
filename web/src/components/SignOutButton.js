"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_CLASS =
  "rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

export default function SignOutButton({ className = DEFAULT_CLASS, children = "Sign out", title, style }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleSignOut} className={className} title={title} style={style}>
      {children}
    </button>
  );
}
