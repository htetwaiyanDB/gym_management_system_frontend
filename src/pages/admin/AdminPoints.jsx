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
  const totalUsers = users.length;
  const totalPoints = useMemo(
    () => users.reduce((sum, user) => sum + Number(pointsMap[String(user.id)]?.points ?? 0), 0),
    [users, pointsMap]
  );
  const averagePoints = totalUsers ? Math.round(totalPoints / totalUsers) : 0;
  const topUser = useMemo(() => {
    if (!users.length) return null;
    return users.reduce((leader, user) => {
      const leaderScore = leader ? Number(pointsMap[String(leader.id)]?.points ?? 0) : -Infinity;
      const userScore = Number(pointsMap[String(user.id)]?.points ?? 0);
      return userScore > leaderScore ? user : leader;
    }, null);
  }, [users, pointsMap]);
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
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 text-slate-100 md:p-6">
      <div className="overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/60 p-5 shadow-xl shadow-cyan-950/20 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Admin dashboard</p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">Points Management Hub</h1>
            <p className="mt-2 text-sm text-slate-300">
              Track user balances and apply adjustments with better visibility.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl border border-slate-500/70 bg-slate-800/70 px-4 py-2 text-sm font-medium transition hover:border-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Members</p>
          <p className="mt-1 text-2xl font-semibold text-white">{totalUsers}</p>
          <p className="mt-1 text-xs text-slate-400">Total users with editable points</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Points</p>
          <p className="mt-1 text-2xl font-semibold text-cyan-300">{totalPoints.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-400">Combined balance across all users</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Average Balance</p>
          <p className="mt-1 text-2xl font-semibold text-white">{averagePoints.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-400">Average points per user</p>
        </article>
        <article className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4">
          <p className="text-xs uppercase tracking-wide text-cyan-200/80">Top Balance</p>
          <p className="mt-1 text-lg font-semibold text-cyan-100">{topUser?.name || "—"}</p>
          <p className="mt-1 text-sm text-cyan-100/90">
            {topUser ? `${Number(pointsMap[String(topUser.id)]?.points ?? 0).toLocaleString()} pts` : "No data"}
          </p>
        </article>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Member balances</h2>
          <p className="text-sm text-slate-400">Select a member and quickly update their point wallet.</p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/40 bg-rose-500/10 text-rose-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 shadow-sm md:p-5">
          <label htmlFor="search" className="mb-2 block text-sm font-medium text-slate-300">
            Search users
          </label>
          <input
            id="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or phone"
            className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition placeholder:text-slate-500 focus:border-cyan-400"
          />

          <div className="max-h-[500px] overflow-y-auto rounded-xl border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-950/80 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredUsers.map((user) => {
                  const active = String(user.id) === String(selectedUserId);
                  const points = Number(pointsMap[String(user.id)]?.points ?? 0);

                  return (
                    <tr
                      key={user.id}
                      onClick={() => setSelectedUserId(String(user.id))}
                      className={`cursor-pointer transition ${
                        active ? "bg-cyan-500/15" : "hover:bg-slate-800/70"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-100">{user.name}</p>
                        <p className="text-xs text-slate-400">{user.phone}</p>
                      </td>
                      <td className="px-3 py-2 capitalize text-slate-300">{user.role || "-"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-cyan-300">{points}</td>
                    </tr>
                  );
                })}
                {!loading && !filteredUsers.length && (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-slate-400">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 shadow-sm md:p-5">
          <h2 className="text-lg font-semibold">Adjust User Points</h2>

          {!selectedUser ? (
            <p className="mt-4 text-sm text-slate-400">Select a user from the list to begin.</p>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Selected user</p>
                <p className="mt-1 font-semibold text-slate-100">{selectedUser.name}</p>
                <p className="text-xs text-slate-400">{selectedUser.phone}</p>
                <p className="mt-3 inline-flex rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                  Current balance: {currentBalance.toLocaleString()} points
                </p>
              </div>

              <div>
                <label htmlFor="points-adjust" className="mb-2 block text-sm font-medium text-slate-300">
                  Point adjustment (use negative for subtraction)
                </label>
                <input
                  id="points-adjust"
                  type="number"
                  value={adjustment}
                  onChange={(event) => setAdjustment(event.target.value)}
                  placeholder="e.g. -5000"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {[-100, -50, 50, 100].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAdjustment(String(value))}
                      className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-cyan-400 hover:text-cyan-200"
                    >
                      {value > 0 ? `+${value}` : value}
                    </button>
                  ))}
                </div>
                {wouldGoNegative && (
                  <p className="mt-2 text-xs text-rose-300">
                    This adjustment would create a negative balance. Please enter a smaller deduction.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={saving || !isAdjustmentValid || wouldGoNegative}
                className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Updating..." : "Apply Adjustment"}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
