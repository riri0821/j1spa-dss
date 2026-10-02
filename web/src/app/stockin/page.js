import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import { theme } from "../dashboard/theme";
import Sidebar from "../dashboard/Sidebar";
import StockInScreen from "./StockInScreen";

export default async function StockInPage() {
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

  const isOwner = profile?.role === "owner";

  const body = (
    <>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: theme.textPrimary }}>
            Stock-in
          </h1>
          <p className="text-sm" style={{ color: theme.textMuted }}>
            Signed in as {profile?.full_name} - role: {profile?.role}. A positive quantity records
            stock received; a negative quantity records a correction.
          </p>
        </div>
        {!isOwner && (
          <div className="flex items-center gap-3">
            <a href="/sales" className="text-sm hover:underline" style={{ color: theme.textSecondary }}>
              Go to sales
            </a>
            <SignOutButton className="rounded border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5" />
          </div>
        )}
      </div>
      <StockInScreen />
    </>
  );

  if (isOwner) {
    return (
      <div className="flex flex-col md:flex-row h-screen overflow-hidden font-sans" style={{ backgroundColor: theme.pageBg }}>
        <Sidebar active="stockin" fullName={profile.full_name} role={profile.role} />
        <main className="flex-1 overflow-y-auto p-8">{body}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 font-sans" style={{ backgroundColor: theme.pageBg }}>
      {body}
    </div>
  );
}
