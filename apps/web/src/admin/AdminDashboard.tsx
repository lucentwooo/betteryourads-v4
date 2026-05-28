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
  // Per-row UI state: which row is awaiting delete confirmation, which is deleting, row errors.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

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
      setConfirming(null);
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
                const isConfirming = confirming === u.id;
                const isDeleting = deleting === u.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <span className="cell-email">{u.email ?? "—"}</span>
                      {isSelf && <span className="badge blue" style={{ marginLeft: "var(--space-2)" }}>You</span>}
                      {rowError[u.id] && (
                        <div className="small" role="alert" style={{ color: "var(--bya-oxblood)", marginTop: "var(--space-1)" }}>
                          {rowError[u.id]}
                        </div>
                      )}
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
                      ) : isConfirming ? (
                        <div className="actions-row" style={{ justifyContent: "flex-end" }}>
                          <button className="btn sm danger" onClick={() => void remove(u.id)} disabled={isDeleting}>
                            {isDeleting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "Confirm"}
                          </button>
                          <button className="btn sm ghost" onClick={() => setConfirming(null)} disabled={isDeleting}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn sm danger-ghost"
                          onClick={() => setConfirming(u.id)}
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
    </div>
  );
}
