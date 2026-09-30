"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [status, setStatus] = useState("checking");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .then(({ count, error }) => {
        if (error) {
          setStatus("error");
          setDetail(error.message);
        } else {
          setStatus("connected");
          setDetail(`products table reachable (${count ?? 0} rows)`);
        }
      });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-8 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        J1SPA DSS - PERN migration
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">Phase 0: Supabase connection check</p>
      <div
        className={`rounded-lg border px-4 py-3 font-mono text-sm ${
          status === "connected"
            ? "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
            : status === "error"
            ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
            : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
        }`}
      >
        status: {status}
        {detail ? ` - ${detail}` : ""}
      </div>
    </div>
  );
}
