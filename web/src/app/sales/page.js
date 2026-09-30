import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import { theme } from "../dashboard/theme";
import Sidebar from "../dashboard/Sidebar";
import SalesScreen from "./SalesScreen";
import ExportButton from "./ExportButton";

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

  const isOwner = profile?.role === "owner";

  const body = (
    <>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: theme.textPrimary }}>
            Sales
          </h1>
          <p className="text-sm" style={{ color: theme.textMuted }}>
            Signed in as {profile?.full_name} - role: {profile?.role}. No unit cost or gross profit
            is shown on this screen, matching the original app&apos;s staff restrictions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton role={profile?.role} />
          {!isOwner && (
            <>
              <a href="/stockin" className="text-sm hover:underline" style={{ color: theme.textSecondary }}>
                Go to stock-in
              </a>
              <SignOutButton className="rounded border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5" />
            </>
          )}
        </div>
      </div>
      <SalesScreen userId={user.id} role={profile?.role} />
    </>
  );

  if (isOwner) {
    return (
      <div className="flex h-screen overflow-hidden font-sans" style={{ backgroundColor: theme.pageBg }}>
        <Sidebar active="sales" fullName={profile.full_name} role={profile.role} />
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
