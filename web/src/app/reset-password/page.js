"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    await supabase.auth.signOut();
    setTimeout(() => {
      router.push("/login?reset=success");
      router.refresh();
    }, 1200);
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#05070c] px-6 text-[#f5f6f8]">
      <div className="w-full max-w-sm rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#10151f] p-8">
        <h1 className="text-xl font-bold tracking-tight">Set a new password</h1>
        <p className="mt-1 text-sm text-[#9aa3b2]">Choose a new password for the owner account.</p>

        {error && (
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-[#d03b3b]/20 bg-[#d03b3b]/10 p-3 text-xs text-[#d03b3b]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#9aa3b2]">New password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0d1119] py-3 pl-10 pr-4 text-sm text-[#f5f6f8] transition-colors placeholder:text-[#6b7280] focus:border-[#22c55e] focus:outline-none focus:ring-1 focus:ring-[#22c55e]/50"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#9aa3b2]">Confirm password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0d1119] py-3 pl-10 pr-4 text-sm text-[#f5f6f8] transition-colors placeholder:text-[#6b7280] focus:border-[#22c55e] focus:outline-none focus:ring-1 focus:ring-[#22c55e]/50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || done}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#22c55e] py-3 text-sm font-semibold text-[#05230f] shadow-lg transition hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : done ? (
              <span>Password updated - redirecting...</span>
            ) : (
              <span>Save new password</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
