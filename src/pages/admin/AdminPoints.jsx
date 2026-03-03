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
      {/* Header Section */}
      <div className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-r from-cyan-900/40 via-slate-900 to-purple-900/40 p-6 shadow-2xl backdrop-blur-sm md:p-8">
        <div className="absolute top-0 right-0 h-32 w-32 translate-x-16 -translate-y-16 rounded-full bg-cyan-500/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 h-32 w-32 -translate-x-16 translate-y-16 rounded-full bg-purple-500/10 blur-3xl"></div>
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">Admin dashboard</p>
            </div>
            <h1 className="text-3xl font-bold md:text-4xl">Points Management</h1>
            <p className="max-w-xl text-sm text-slate-300 md:text-base">
              Seamlessly track user balances and apply point adjustments with enhanced precision and control.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition-all duration-300 hover:border-cyan-400 hover:bg-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className={`h-4 w-4 transition-transform ${loading ? "animate-spin" : "group-hover:rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Users Card */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/40 hover:shadow-cyan-900/30 backdrop-blur-sm">
          <div className="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-cyan-500/5 blur-2xl transition-all group-hover:bg-cyan-500/10"></div>
          <div className="relative flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Members</p>
              <p className="text-3xl font-bold text-white">{totalUsers.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Active users in system</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 text-cyan-300 shadow-lg">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Total Points Card */}
        <div className="group relative overflow-hidden rounded-2xl border border-cyan-700/50 bg-gradient-to-br from-cyan-900/30 to-slate-900/60 p-5 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400 hover:shadow-cyan-900/40 backdrop-blur-sm">
          <div className="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-cyan-500/10 blur-2xl transition-all group-hover:bg-cyan-500/20"></div>
          <div className="relative flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300/80">Total Points</p>
              <p className="text-3xl font-bold text-cyan-200">{totalPoints.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Combined balance</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-cyan-500/10 text-cyan-300 shadow-lg">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Average Points Card */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-purple-500/40 hover:shadow-purple-900/30 backdrop-blur-sm">
          <div className="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-purple-500/5 blur-2xl transition-all group-hover:bg-purple-500/10"></div>
          <div className="relative flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Average Balance</p>
              <p className="text-3xl font-bold text-white">{averagePoints.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Points per user</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 text-purple-300 shadow-lg">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Top User Card */}
        <div className="group relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-5 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-amber-400 hover:shadow-amber-900/40 backdrop-blur-sm">
          <div className="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-amber-500/10 blur-2xl transition-all group-hover:bg-amber-500/20"></div>
          <div className="relative flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300/80">Top Balance</p>
              <p className="text-lg font-bold text-amber-100">{topUser?.name || "—"}</p>
              <p className="text-sm font-semibold text-amber-200">
                {topUser ? `${Number(pointsMap[String(topUser.id)]?.points ?? 0).toLocaleString()} pts` : "No data"}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-orange-500/10 text-amber-300 shadow-lg">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Action Section Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Manage Member Balances</h2>
          <p className="text-sm text-slate-400">Select a member and update their point wallet instantly.</p>
        </div>
      </div>

      {/* Message Alert */}
      {message && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm backdrop-blur-sm ${
            message.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/40 bg-rose-500/10 text-rose-300"
          }`}
        >
          {message.type === "success" ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* User Selection Panel */}
        <section className="flex flex-col rounded-3xl border border-slate-700/80 bg-gradient-to-b from-slate-900/95 to-slate-950/70 p-6 shadow-2xl backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Search Members</h3>
              <p className="text-xs text-slate-400">Find users by name or phone number</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          
          <input
            id="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type to search..."
            className="mb-4 w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none ring-0 transition-all placeholder:text-slate-500 focus:border-cyan-400/60 focus:shadow-lg focus:shadow-cyan-500/10"
          />

          <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/40">
            <div className="max-h-[520px] space-y-2 overflow-y-auto p-3 scrollbar-thin scrollbar-track-slate-900/50 scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600">
              {filteredUsers.map((user) => {
                const active = String(user.id) === String(selectedUserId);
                const points = Number(pointsMap[String(user.id)]?.points ?? 0);

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(String(user.id))}
                    className={`group w-full overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${
                      active
                        ? "border-cyan-400/60 bg-cyan-500/10 shadow-lg shadow-cyan-950/30"
                        : "border-slate-700/60 bg-slate-900/50 hover:border-slate-500 hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-all ${
                          active 
                            ? "bg-gradient-to-br from-cyan-400 to-cyan-600 text-white shadow-lg shadow-cyan-500/30" 
                            : "bg-slate-800 text-cyan-200 group-hover:bg-slate-700"
                        }`}>
                          {String(user.name || "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-100">{user.name}</p>
                          <p className="truncate text-xs text-slate-400">{user.phone}</p>
                          <p className="mt-1 text-xs capitalize text-slate-500">{user.role || "-"}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                          active
                            ? "border border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                            : "border border-slate-600 bg-slate-800 text-slate-300"
                        }`}>
                          {points.toLocaleString()} pts
                        </span>
                        {active && (
                          <span className="flex items-center gap-1 text-xs text-cyan-300">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400"></span>
                            Selected
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {!loading && !filteredUsers.length && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/30 px-3 py-12 text-center">
                  <svg className="mb-3 h-12 w-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-slate-400">No users found matching your search.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Adjustment Panel */}
        <section className="flex flex-col rounded-3xl border border-slate-700/80 bg-gradient-to-b from-slate-900/95 to-slate-950/70 p-6 shadow-2xl backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Adjust Points</h3>
              <p className="text-xs text-slate-400">Update member balance</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-300">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
          </div>

          {!selectedUser ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/30 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800/60 text-slate-500">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-400">No User Selected</p>
              <p className="mt-1 text-xs text-slate-500">Choose a member from the list to begin</p>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* User Info Card */}
              <div className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 p-5 backdrop-blur-sm">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
                    <span className="text-sm font-bold">{String(selectedUser.name || "?").slice(0, 1).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-100">{selectedUser.name}</p>
                    <p className="text-xs text-slate-400">{selectedUser.phone}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Current Balance</p>
                    <p className="text-2xl font-bold text-cyan-200">{currentBalance.toLocaleString()}</p>
                  </div>
                  <span className="rounded-full border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-xs font-semibold text-cyan-100">
                    {currentBalance.toLocaleString()} points
                  </span>
                </div>
              </div>

              {/* Input Section */}
              <div className="space-y-3">
                <label htmlFor="points-adjust" className="block text-sm font-medium text-slate-300">
                  Point Adjustment
                </label>
                <div className="relative">
                  <input
                    id="points-adjust"
                    type="number"
                    value={adjustment}
                    onChange={(event) => setAdjustment(event.target.value)}
                    placeholder="e.g. -5000 or 1000"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-500 focus:border-cyan-400/60 focus:shadow-lg focus:shadow-cyan-500/10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    PTS
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Use negative values to subtract points (e.g., -500)
                </p>
                
                {/* Quick Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {[-100, -50, 50, 100].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAdjustment(String(value))}
                      className="rounded-lg border border-slate-700/60 bg-slate-800/50 px-4 py-2 text-xs font-semibold text-slate-300 transition-all hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:text-cyan-200"
                    >
                      {value > 0 ? `+${value}` : value}
                    </button>
                  ))}
                </div>
                
                {wouldGoNegative && (
                  <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    This adjustment would create a negative balance. Please enter a smaller deduction.
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={saving || !isAdjustmentValid || wouldGoNegative}
                className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/30 transition-all hover:from-cyan-400 hover:to-cyan-500 hover:shadow-cyan-400/40 disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-400 disabled:shadow-none"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {saving ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Apply Adjustment
                    </>
                  )}
                </span>
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
