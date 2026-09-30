"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { theme } from "../dashboard/theme";

export default function SettingsScreen({ currentUserId, currentEmail, initialUsers }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <ChangePasswordCard currentEmail={currentEmail} />
      <StaffCard currentUserId={currentUserId} users={initialUsers} />
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="rounded-lg border p-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
      <h2 className="mb-3 text-sm font-semibold" style={{ color: theme.textPrimary }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const inputClass = "rounded border px-3 py-1.5 text-sm";
const inputStyle = { backgroundColor: theme.cardBgAlt, borderColor: theme.border, color: theme.textPrimary };

function ChangePasswordCard({ currentEmail }) {
  const supabase = createClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (next.length < 6) return setError("New password must be at least 6 characters.");
    if (next !== confirm) return setError("New password and confirmation don't match.");

    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: current,
    });
    if (signInError) {
      setBusy(false);
      return setError("Current password is incorrect.");
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (updateError) return setError(updateError.message);

    setNotice("Password updated.");
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <Card title="Change password">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={inputClass}
          style={inputStyle}
          required
        />
        <input
          type="password"
          placeholder="New password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={inputClass}
          style={inputStyle}
          required
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
          style={inputStyle}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-green-400">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-fit rounded px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: theme.accent, color: "#05230f" }}
        >
          {busy ? "Updating..." : "Update password"}
        </button>
      </form>
    </Card>
  );
}

function StaffCard({ currentUserId, users }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [busyAdd, setBusyAdd] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    setBusyAdd(true);
    const res = await fetch("/api/settings/add-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password }),
    });
    const body = await res.json();
    setBusyAdd(false);
    if (!res.ok) return setError(body.error || "Failed to add staff.");
    setEmail("");
    setName("");
    setPassword("");
    setShowAdd(false);
    router.refresh();
  }

  async function handleToggle(id) {
    setBusyId(id);
    setError("");
    const res = await fetch("/api/settings/toggle-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = await res.json();
    setBusyId(null);
    if (!res.ok) return setError(body.error || "Failed to update user.");
    router.refresh();
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete staff account "${name}"? Their sales/stock-in history is kept but reassigned to "Former staff".`))
      return;
    setBusyId(id);
    setError("");
    const res = await fetch("/api/settings/delete-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = await res.json();
    setBusyId(null);
    if (!res.ok) return setError(body.error || "Failed to delete user.");
    router.refresh();
  }

  return (
    <Card title="Staff accounts">
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded border" style={{ borderColor: theme.border }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: theme.textMuted }}>
              <th className="px-3 py-2 font-normal">Name</th>
              <th className="px-3 py-2 font-normal">Email</th>
              <th className="px-3 py-2 font-normal">Role</th>
              <th className="px-3 py-2 font-normal">Status</th>
              <th className="px-3 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t" style={{ borderColor: theme.border }}>
                <td className="px-3 py-2" style={{ color: theme.textPrimary }}>
                  {u.full_name}
                </td>
                <td className="px-3 py-2" style={{ color: theme.textSecondary }}>
                  {u.username}
                </td>
                <td className="px-3 py-2 capitalize" style={{ color: theme.textSecondary }}>
                  {u.role}
                </td>
                <td className="px-3 py-2" style={{ color: u.is_active ? "#0ca30c" : theme.textMuted }}>
                  {u.is_active ? "Active" : "Inactive"}
                </td>
                <td className="px-3 py-2 text-right">
                  {u.id !== currentUserId && u.role === "staff" && (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => handleToggle(u.id)}
                        disabled={busyId === u.id}
                        className="text-xs"
                        style={{ color: "#5598e7" }}
                      >
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleDelete(u.id, u.full_name)}
                        disabled={busyId === u.id}
                        className="text-xs text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd ? (
        <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email (used to sign in)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            style={inputStyle}
            required
          />
          <input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            style={inputStyle}
            required
          />
          <input
            type="password"
            placeholder="Password (6+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            style={inputStyle}
            required
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busyAdd}
              className="rounded px-4 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: theme.accent, color: "#05230f" }}
            >
              {busyAdd ? "Adding..." : "Add staff"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded border px-4 py-1.5 text-sm"
              style={{ borderColor: theme.border, color: theme.textSecondary }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-4 rounded px-4 py-1.5 text-sm font-medium"
          style={{ backgroundColor: theme.accent, color: "#05230f" }}
        >
          + Add staff
        </button>
      )}
    </Card>
  );
}
