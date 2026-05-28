import { useCallback, useEffect, useState } from "react";
import type { AdminUser } from "@bya/shared";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { IconTrash } from "../ui/icons";

// Only this account may use the dashboard (mirrors the backend gate).
const ADMIN_EMAIL = "admin@betteryourads.dev";

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export default function AdminDashboard() {
  const { userId, email } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // `confirming` holds the id of the account whose delete modal is open; `confirmText` is what
  // the admin has typed into the type-to-confirm field. `deleting` is the in-flight delete.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const confirmUser = users.find((u) => u.id === confirming) ?? null;
  // What the admin must type verbatim to enable deletion: the account's email, or "DELETE" as a
  // fallback for the (rare) account with no email on record.
  const required = confirmUser ? (confirmUser.email ?? "DELETE") : "";
  const confirmMatches = confirmText.trim().toLowerCase() === required.toLowerCase();

  const closeConfirm = useCallback(() => {
    setConfirming(null);
    setConfirmText("");
  }, []);

  // Escape closes the modal (unless a delete is mid-flight).
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !deleting) closeConfirm(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, deleting, closeConfirm]);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.getAdminUsers()
      .then((u) => { if (active) setUsers(u); })
      .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : "Could not load accounts."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => load(), [load]);

  async function remove(id: string) {
    setDeleting(id);
    setRowError((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      await api.deleteAdminUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      closeConfirm();
    } catch (e) {
      setRowError((prev) => ({ ...prev, [id]: e instanceof ApiError ? e.message : "Could not remove this account." }));
    } finally {
      setDeleting(null);
    }
  }

  if (email && email.toLowerCase() !== ADMIN_EMAIL) {
    return (
      <div className="empty">
        <p className="lead" style={{ margin: 0 }}>Not authorized</p>
        <p className="small" style={{ margin: 0 }}>This area is for administrators only.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Accounts</h1>
          {!loading && !error && (
            <p className="small" style={{ margin: "var(--space-1) 0 0", color: "var(--fg-3)" }}>
              {users.length} {users.length === 1 ? "account" : "accounts"}
            </p>
          )}
        </div>
        <button className="btn" onClick={() => load()} disabled={loading}>Refresh</button>
      </div>

      {loading && (
        <div className="status-row"><span className="spinner" /> Loading accounts…</div>
      )}

      {!loading && error && (
        <div className="stage">
          <div className="stage-body">
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{error}</p>
            <button className="btn" onClick={() => load()}>Try again</button>
          </div>
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <div className="empty">
          <p className="lead" style={{ margin: 0 }}>No accounts</p>
          <p className="small" style={{ margin: 0 }}>Signed-up accounts will appear here.</p>
        </div>
      )}

      {!loading && !error && users.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
                <th scope="col">Joined</th>
                <th scope="col">Last sign-in</th>
                <th scope="col" className="ta-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === userId;
                return (
                  <tr key={u.id}>
                    <td>
                      <span className="cell-email">{u.email ?? "—"}</span>
                      {isSelf && <span className="badge blue" style={{ marginLeft: "var(--space-2)" }}>You</span>}
                    </td>
                    <td>
                      <div className="actions-row" style={{ gap: "var(--space-1)" }}>
                        <span className={`badge ${u.approved ? "success" : "warn"}`}>
                          {u.approved ? "Approved" : "Pending"}
                        </span>
                        {u.isAdmin && <span className="badge blue">Admin</span>}
                      </div>
                    </td>
                    <td><span className="cell-mono">{fmtDate(u.createdAt)}</span></td>
                    <td><span className="cell-mono">{fmtDate(u.lastSignInAt)}</span></td>
                    <td className="ta-right">
                      {isSelf ? (
                        <span className="small" style={{ color: "var(--fg-3)" }}>—</span>
                      ) : (
                        <button
                          className="btn sm danger-ghost"
                          onClick={() => { setConfirming(u.id); setConfirmText(""); }}
                          aria-label={`Remove ${u.email ?? "account"}`}
                        >
                          <IconTrash width={14} height={14} />
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmUser && (() => {
        const isDeleting = deleting === confirmUser.id;
        return (
          <div className="modal-scrim" role="presentation" onClick={() => { if (!isDeleting) closeConfirm(); }}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="del-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="del-title" style={{ margin: 0 }}>Delete account</h2>
              <p style={{ margin: "var(--space-3) 0 0", color: "var(--fg-2)" }}>
                This permanently deletes{" "}
                <strong style={{ color: "var(--fg)" }}>{confirmUser.email ?? "this account"}</strong>{" "}
                and all of their data — saved brands and generated ads. This cannot be undone.
              </p>
              <div className="field" style={{ marginTop: "var(--space-4)", marginBottom: 0 }}>
                <label htmlFor="del-confirm">
                  Type <span className="mono" style={{ color: "var(--fg)" }}>{required}</span> to confirm
                </label>
                <input
                  id="del-confirm"
                  className="input"
                  value={confirmText}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={required}
                  disabled={isDeleting}
                  onChange={(e) => setConfirmText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && confirmMatches && !isDeleting) void remove(confirmUser.id); }}
                />
              </div>
              {rowError[confirmUser.id] && (
                <div className="small" role="alert" style={{ color: "var(--bya-oxblood)", marginTop: "var(--space-3)" }}>
                  {rowError[confirmUser.id]}
                </div>
              )}
              <div className="actions-row" style={{ justifyContent: "flex-end", marginTop: "var(--space-5)" }}>
                <button className="btn ghost" onClick={closeConfirm} disabled={isDeleting}>Cancel</button>
                <button
                  className="btn danger"
                  onClick={() => void remove(confirmUser.id)}
                  disabled={!confirmMatches || isDeleting}
                >
                  {isDeleting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "Delete account"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
