"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { theme } from "./theme";

// The original app's "Refresh" button triggered a manual ETL sync. There's
// no ETL anymore (data is already live) - this just re-runs the dashboard's
// server-side data fetch, which is still a meaningful action (the page
// isn't auto-polling) even though "syncing" no longer applies.
export default function RefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  function handleClick() {
    setSpinning(true);
    router.refresh();
    setTimeout(() => setSpinning(false), 500);
  }

  return (
    <button
      onClick={handleClick}
      className="flex w-fit items-center gap-2 rounded px-4 py-2 text-sm font-medium"
      style={{ backgroundColor: theme.accent, color: "#05230f" }}
    >
      <span className={spinning ? "animate-spin" : ""}>⟳</span> Refresh
    </button>
  );
}
