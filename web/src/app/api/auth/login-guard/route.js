import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLockout, recordFailure, recordSuccess } from "@/lib/loginLockout";

// Public route (allow-listed in proxy.js) - gates/records login attempts
// against `login_lockouts` before/after the actual Supabase Auth call,
// which the client makes directly. See web/src/lib/loginLockout.js for
// the escalation policy.
export async function POST(request) {
  let email, action;
  try {
    ({ email, action } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const identifier = (email ?? "").trim().toLowerCase();
  if (!identifier || !["check", "fail", "success"].includes(action)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "check") {
    return NextResponse.json(await checkLockout(admin, identifier));
  }
  if (action === "fail") {
    return NextResponse.json(await recordFailure(admin, identifier));
  }
  await recordSuccess(admin, identifier);
  return NextResponse.json({ ok: true });
}
