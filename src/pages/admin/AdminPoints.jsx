import React, { useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";
import { adjustUserPoints, getPoints } from "../../api/pointsApi";

const normalizeUsers = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
};

const normalizeUser = (user) => ({
  id: user?.id ?? user?.user?.id ?? user?.member_id ?? null,
  name: user?.name || user?.user_name || "-",
  phone: user?.phone || "-",
  role: String(user?.role || user?.user_role || "").toLowerCase(),
});

const allowedRoles = new Set(["user", "trainer"]);

const getAdjustedBalance = (payload, fallback) => {
  const candidate =
    payload?.updated_points ??
    payload?.current_points ??
    payload?.new_balance ??
    payload?.new_points ??
    payload?.points_balance ??
    payload?.balance ??
    payload?.points ??
    payload?.data?.updated_points ??
    payload?.data?.current_points ??
    payload?.data?.new_balance ??
    payload?.data?.new_points ??
    payload?.data?.points_balance ??
    payload?.data?.balance ??
    payload?.data?.points;

  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function AdminPoints() {
  const [users, setUsers] = useState([]);
  const [pointsMap, setPointsMap] = useState({});
  const [selectedUserId, setSelectedUserId] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [usersRes, points] = await Promise.all([axiosClient.get("/users"), getPoints()]);

      const userRows = normalizeUsers(usersRes?.data)
        .map(normalizeUser)
        .filter((u) => u.id && allowedRoles.has(u.role));

      const pointsByUser = points.reduce((acc, item) => {
        acc[String(item.user_id)] = item;
        return acc;
      }, {});

      setUsers(userRows);
      setPointsMap(pointsByUser);
    } catch (error) {
      setMessage({ type: "error", text: error?.response?.data?.message || "Failed to load users and points." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.name, u.phone].some((value) => String(value || "").toLowerCase().includes(q)));
  }, [users, query]);

  const selectedUser = useMemo(
    () => users.find((user) => String(user.id) === String(selectedUserId)) || null,
    [users, selectedUserId]
  );

  const currentBalance = selectedUser ? Number(pointsMap[String(selectedUser.id)]?.points ?? 0) : 0;
  const adjustmentValue = Number(adjustment);
  const isAdjustmentValid = Number.isFinite(adjustmentValue) && adjustment.trim() !== "" && adjustmentValue !== 0;
  const wouldGoNegative = isAdjustmentValid && currentBalance + adjustmentValue < 0;

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedUser) {
      setMessage({ type: "error", text: "Please select a user first." });
      return;
    }

    if (!isAdjustmentValid) {
      setMessage({ type: "error", text: "Enter a non-zero numeric adjustment value." });
      return;
    }

    if (wouldGoNegative) {
      setMessage({ type: "error", text: "Cannot subtract more points than the user currently has." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const responseData = await adjustUserPoints({
        userId: selectedUser.id,
        points: adjustmentValue,
      });

      const nextBalance = Math.max(0, getAdjustedBalance(responseData, currentBalance + adjustmentValue));

      setPointsMap((prev) => ({
        ...prev,
        [String(selectedUser.id)]: {
          ...(prev[String(selectedUser.id)] || {}),
          user_id: selectedUser.id,
          points: nextBalance,
          user_name: selectedUser.name,
          user_role: selectedUser.role,
        },
      }));

      setAdjustment("");
      setMessage({ type: "success", text: `${selectedUser.name}'s balance updated to ${nextBalance} points.` });
    } catch (error) {
      setMessage({ type: "error", text: error?.response?.data?.message || "Failed to adjust points." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 text-white md:p-6">
      <div className="rounded-3xl border border-slate-700/80 bg-slate-900/50 p-5 backdrop-blur-sm md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-3xl font-bold leading-tight">Welcome, Admin</p>
            <p className="mt-1 text-lg text-slate-300">Manage your gym system here</p>
          </div>
          <p className="mt-1 text-lg text-slate-300">Secure Admin</p>
        </div>
      </div>

      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <h1 className="text-5xl font-bold leading-none text-white">Points</h1>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="rounded-lg border border-slate-500/70 bg-slate-900/70 px-5 py-2 text-2xl text-slate-100 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {message && (
        <div
          className={`rounded-xl px-5 py-4 text-2xl ${
            message.type === "success" ? "bg-emerald-200 text-emerald-900" : "bg-rose-200 text-rose-900"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.45fr_1fr]">
        <section className="rounded-2xl border border-slate-700/45 bg-slate-900/65 p-5 shadow-lg shadow-black/20 transition duration-300 hover:-translate-y-1 hover:border-slate-400/65 hover:shadow-xl hover:shadow-black/35">
          <h2 className="mb-3 text-4xl font-semibold">Search user/trainer (name / phone)</h2>
          <input
            id="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type name or phone..."
            className="mb-5 w-full rounded-lg border border-slate-400 bg-white/90 px-4 py-3 text-2xl text-slate-900 outline-none"
          />

          <div className="overflow-hidden rounded-lg border border-slate-700/70">
            <table className="w-full text-left">
              <thead className="bg-slate-950/90 text-2xl font-semibold text-white">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="text-2xl text-slate-100">
                {filteredUsers.map((user) => {
                  const points = Number(pointsMap[String(user.id)]?.points ?? 0);
                  const isSelected = String(selectedUserId) === String(user.id);

                  return (
                    <tr
                      key={user.id}
                      onClick={() => setSelectedUserId(String(user.id))}
                      className={`cursor-pointer border-t border-slate-700/70 transition ${
                        isSelected ? "bg-slate-600/60" : "bg-slate-900/70 hover:bg-slate-800"
                      }`}
                    >
                      <td className="px-4 py-3">{user.name}</td>
                      <td className="px-4 py-3 capitalize">{user.role || "-"}</td>
                      <td className="px-4 py-3">{user.phone}</td>
                      <td className="px-4 py-3 text-right font-semibold">{points.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {!filteredUsers.length && (
                  <tr className="border-t border-slate-700 bg-slate-900/70">
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                      No matching users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700/45 bg-slate-900/65 p-5 shadow-lg shadow-black/20 transition duration-300 hover:-translate-y-1 hover:border-slate-400/65 hover:shadow-xl hover:shadow-black/35">
          <h3 className="text-5xl font-semibold">Adjust Points</h3>
          {!selectedUser ? (
            <p className="mt-6 text-2xl text-slate-400">Select a user from the left table first.</p>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div>
                <p className="text-3xl text-slate-400">User</p>
                <p className="text-4xl font-bold">{selectedUser.name}</p>
                <p className="text-2xl text-slate-400 capitalize">{selectedUser.role}</p>
                <p className="text-2xl text-slate-500">{selectedUser.phone}</p>
              </div>

              <div>
                <p className="text-3xl text-slate-400">Current points</p>
                <p className="text-7xl font-bold leading-none">{currentBalance.toLocaleString()}</p>
              </div>

              <div>
                <label htmlFor="points-adjust" className="mb-2 block text-3xl font-semibold">
                  New points value
                </label>
                <input
                  id="points-adjust"
                  type="number"
                  value={adjustment}
                  onChange={(event) => setAdjustment(event.target.value)}
                  placeholder="Enter positive or negative value"
                  className="w-full rounded-lg border border-slate-400 bg-white/90 px-4 py-3 text-2xl text-slate-900 outline-none"
                />
                {wouldGoNegative && (
                  <p className="mt-2 text-lg text-rose-300">This value would make points negative.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={saving || !isAdjustmentValid || wouldGoNegative}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-3xl font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {saving ? "Updating..." : "Update Points"}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
