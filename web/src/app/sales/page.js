import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import SalesScreen from "./SalesScreen";

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
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Sales</h1>
        <div className="flex items-center gap-3">
          {profile?.role === "owner" && (
            <a href="/dashboard" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
              Back to dashboard
            </a>
          )}
          <SignOutButton />
        </div>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Signed in as {profile?.full_name} - role: {profile?.role}. No unit cost or gross profit
        is shown on this screen, matching the original app&apos;s staff restrictions.
      </p>
      <SalesScreen userId={user.id} role={profile?.role} />
    </div>
  );
}
