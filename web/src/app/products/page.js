import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import ProductsScreen from "./ProductsScreen";

export default async function ProductsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "owner") redirect("/sales");

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-zinc-50 p-8 font-sans dark:bg-black">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Products</h1>
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
            Back to dashboard
          </a>
          <SignOutButton />
        </div>
      </div>
      <ProductsScreen />
    </div>
  );
}
