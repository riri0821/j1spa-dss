"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { User, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Characters from "./Characters";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null); // "email" | "password" | null

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [view, setView] = useState("login"); // "login" | "forgot"
  const [infoMessage, setInfoMessage] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("deactivated")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrorMessage("This account has been deactivated. Contact the owner.");
    } else if (params.get("error") === "invalid_reset_link") {
      setErrorMessage("That reset link is invalid or has expired. Request a new one below.");
    } else if (params.get("reset") === "success") {
      setInfoMessage("Password updated. Log in with your new password.");
    }
  }, []);

  async function handleForgotSubmit(e) {
    e.preventDefault();
    setErrorMessage("");
    setForgotSubmitting(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrorMessage(body.error || "Something went wrong. Try again.");
        setForgotSubmitting(false);
        return;
      }
      setForgotSent(true);
    } catch {
      setErrorMessage("Something went wrong. Try again.");
    }
    setForgotSubmitting(false);
  }

  function backToLogin() {
    setView("login");
    setErrorMessage("");
    setInfoMessage("");
    setForgotSent(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setErrorMessage(signInError.message);
      setIsSubmitting(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", data.user.id)
      .single();

    if (profileError) {
      setErrorMessage("Signed in, but no profile row was found for this account.");
      setIsSubmitting(false);
      return;
    }

    if (!profile.is_active) {
      await supabase.auth.signOut();
      setErrorMessage("This account has been deactivated. Contact the owner.");
      setIsSubmitting(false);
      return;
    }

    router.push(profile.role === "owner" ? "/dashboard" : "/sales");
    router.refresh();
  }

  const banners = (
    <AnimatePresence>
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="mt-6 flex items-center gap-2 rounded-lg border border-[#d03b3b]/20 bg-[#d03b3b]/10 p-3 text-xs text-[#d03b3b]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </motion.div>
      )}
      {!errorMessage && infoMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="mt-6 flex items-center gap-2 rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/10 p-3 text-xs text-[#22c55e]"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{infoMessage}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const formFields =
    view === "forgot" ? (
      <>
        {banners}

        {forgotSent ? (
          <div className="mt-6 flex flex-col gap-5">
            <div className="flex items-center gap-2 rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/10 p-3 text-xs text-[#22c55e]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>If that&apos;s the owner&apos;s account email, reset instructions have been sent to it.</span>
            </div>
            <button
              type="button"
              onClick={backToLogin}
              className="text-xs font-medium text-[#9aa3b2] transition-colors hover:text-[#f5f6f8]"
            >
              Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="mt-6 flex flex-col gap-5">
            <p className="text-xs text-[#9aa3b2]">
              Enter the account email. Only the owner&apos;s email can request a reset - staff password resets are
              handled by the owner in Settings.
            </p>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9aa3b2]">Email</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage("");
                  }}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="owner@example.com"
                  className="w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0d1119] py-3 pl-10 pr-4 text-sm text-[#f5f6f8] transition-colors placeholder:text-[#6b7280] focus:border-[#22c55e] focus:outline-none focus:ring-1 focus:ring-[#22c55e]/50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={forgotSubmitting}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#22c55e] py-3 text-sm font-semibold text-[#05230f] shadow-lg transition hover:brightness-110 disabled:opacity-60"
            >
              {forgotSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <span>Send reset instructions</span>
              )}
            </button>

            <button
              type="button"
              onClick={backToLogin}
              className="text-xs font-medium text-[#9aa3b2] transition-colors hover:text-[#f5f6f8]"
            >
              Back to login
            </button>
          </form>
        )}
      </>
    ) : (
      <>
        {banners}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#9aa3b2]">Email</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                placeholder="username"
                className="w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0d1119] py-3 pl-10 pr-4 text-sm text-[#f5f6f8] transition-colors placeholder:text-[#6b7280] focus:border-[#22c55e] focus:outline-none focus:ring-1 focus:ring-[#22c55e]/50"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#9aa3b2]">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0d1119] py-3 pl-10 pr-10 text-sm text-[#f5f6f8] transition-colors placeholder:text-[#6b7280] focus:border-[#22c55e] focus:outline-none focus:ring-1 focus:ring-[#22c55e]/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6b7280] transition-colors hover:text-[#f5f6f8]"
              >
                {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setView("forgot");
                  setErrorMessage("");
                  setInfoMessage("");
                }}
                className="text-xs font-medium text-[#9aa3b2] transition-colors hover:text-[#22c55e]"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#22c55e] py-3 text-sm font-semibold text-[#05230f] shadow-lg transition hover:brightness-110 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Log In</span>
            )}
          </button>
        </form>
      </>
    );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#05070c] text-[#f5f6f8]">
      {/* MOBILE: curved brand panel on top, form, characters at the bottom */}
      <div className="flex md:hidden h-full w-full flex-col overflow-y-auto">
        <div className="shrink-0 rounded-b-[2.5rem] bg-[#0a0e16] px-7 pt-14 pb-10">
          <h1 className="text-2xl font-bold tracking-tight text-[#f5f6f8]">J1SPA Analytics</h1>
        </div>

        <div className="px-7 pt-8">
          <h2 className="text-xl font-bold text-[#f5f6f8]">{view === "forgot" ? "Forgot password" : "Login"}</h2>
          {formFields}
        </div>

        <div className="mt-auto pt-10 h-52 w-full shrink-0">
          <Characters
            isTyping={focusedField === "email"}
            showPassword={showPassword}
            passwordLength={password.length}
            loginFailed={!!errorMessage}
            mobile
          />
        </div>
      </div>

      {/* DESKTOP: two-column layout */}
      {/* LEFT: full-bleed illustration panel */}
      <div className="hidden md:flex md:w-2/5 h-full items-center justify-center bg-[#0a0e16] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:18px_18px] opacity-40 pointer-events-none" />
        <Characters
          isTyping={focusedField === "email"}
          showPassword={showPassword}
          passwordLength={password.length}
          loginFailed={!!errorMessage}
        />
      </div>

      {/* RIGHT: login form, full height */}
      <div className="hidden md:flex md:w-3/5 h-full flex-col justify-center px-8 py-16 md:px-20 lg:px-28 bg-[#10151f]">
        <div className="mx-auto w-full max-w-sm -translate-y-16">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-[#f5f6f8]">J1SPA Analytics</h1>
            <p className="mt-2 text-sm text-[#9aa3b2]">Owner &amp; Staff Portal</p>
          </div>
          <h2 className="mt-8 text-xl font-bold text-[#f5f6f8]">{view === "forgot" ? "Forgot password" : "Login"}</h2>
          {formFields}
        </div>
      </div>
    </div>
  );
}
