import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

export default async function SalesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-zinc-50 p-8 font-sans dark:bg-black">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Sales / Stock-in
        </h1>
        <SignOutButton />
      </div>
      <p className="text-zinc-600 dark:text-zinc-400">
        Signed in as {profile?.full_name} ({user.email}) - role: {profile?.role}.
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Placeholder - direct sales entry / stock-in screens land in Phase 2.
        No unit cost or gross profit will be shown here once real data
        exists, matching the original app&apos;s staff restrictions.
      </p>
    </div>
  );
}
