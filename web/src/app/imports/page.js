import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { theme } from "../dashboard/theme";
import Sidebar from "../dashboard/Sidebar";
import ImportScreen from "./ImportScreen";

export default async function ImportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "owner") redirect("/sales");

  return (
    <div className="flex min-h-screen font-sans" style={{ backgroundColor: theme.pageBg }}>
      <Sidebar active="imports" fullName={profile.full_name} role={profile.role} />
      <main className="flex-1 overflow-y-auto p-8">
        <h1 className="mb-1 text-xl font-semibold" style={{ color: theme.textPrimary }}>
          Data Import
        </h1>
        <p className="mb-6 text-sm" style={{ color: theme.textMuted }}>
          One-time migration of legacy records. Ongoing sales are recorded through Sales Entry / Stock In, never here.
        </p>
        <ImportScreen />
      </main>
    </div>
  );
}
