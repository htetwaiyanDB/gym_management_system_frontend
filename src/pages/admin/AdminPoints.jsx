import React, { useEffect, useMemo, useRef, useState } from "react";
import axiosClient from "../../api/axiosClient";
import { getPoints, upsertUserPoints } from "../../api/pointsApi";
import "./AdminPoints.css";

const normalizeUsers = (payload) => Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.users) ? payload.users : Array.isArray(payload?.data?.data) ? payload.data.data : [];
const normalizeUser = (user) => ({ id: user?.id ?? user?.user?.id ?? user?.member_id ?? null, name: user?.name || user?.user_name || "-", phone: user?.phone || "-", role: String(user?.role || user?.user_role || "").toLowerCase() });
const allowedRoles = new Set(["user", "trainer"]);

export default function AdminPoints() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [pointsMap, setPointsMap] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [nextPoints, setNextPoints] = useState("");
  const isLoadingRef = useRef(false);

  const load = async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoading(true);
    setMsg(null);
    try {
      const [usersRes, points] = await Promise.all([axiosClient.get("/users"), getPoints()]);
      const userRows = normalizeUsers(usersRes?.data).map(normalizeUser).filter((user) => user.id && allowedRoles.has(user.role));
      const mappedPoints = points.reduce((accumulator, item) => ({ ...accumulator, [String(item.user_id)]: item }), {});
      const usersFromPoints = points.filter((item) => item.user_id).map((item) => normalizeUser({ id: item.user_id, name: item.user_name, role: item.user_role })).filter((user) => allowedRoles.has(user.role));
      const mergedUsers = [...userRows, ...usersFromPoints].reduce((accumulator, user) => {
        const previous = accumulator[String(user.id)];
        accumulator[String(user.id)] = previous ? { ...previous, ...user, name: previous.name !== "-" ? previous.name : user.name, phone: previous.phone !== "-" ? previous.phone : user.phone } : user;
        return accumulator;
      }, {});
      setUsers(Object.values(mergedUsers));
      setPointsMap(mappedPoints);
    } catch (error) {
      setMsg({ type: "danger", text: error?.response?.data?.message || "Failed to load points data." });
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery ? users.filter((user) => [user.name, user.phone].some((value) => String(value || "").toLowerCase().includes(normalizedQuery))) : users;
  }, [users, query]);
  const selectedUser = useMemo(() => users.find((user) => String(user.id) === String(selectedUserId)) || null, [users, selectedUserId]);
  const currentPoints = selectedUser ? pointsMap[String(selectedUser.id)]?.points ?? 0 : 0;
  const selectUser = (user) => { setSelectedUserId(user.id); setNextPoints(String(pointsMap[String(user.id)]?.points ?? 0)); setMsg(null); };

  const updatePoints = async () => {
    if (!selectedUser) return setMsg({ type: "danger", text: "Please choose a user first." });
    if (!Number.isFinite(Number(nextPoints)) || Number(nextPoints) < 0) return setMsg({ type: "danger", text: "Enter a valid points value." });
    setSaving(true); setMsg(null);
    try {
      const updated = await upsertUserPoints({ userId: selectedUser.id, points: Number(nextPoints), note: "Adjusted by admin panel" });
      setPointsMap((previous) => ({ ...previous, [String(selectedUser.id)]: { ...(previous[String(selectedUser.id)] || {}), ...updated, user_id: selectedUser.id } }));
      setMsg({ type: "success", text: `Points updated for ${selectedUser.name}.` });
    } catch (error) { setMsg({ type: "danger", text: error?.response?.data?.message || "Failed to update points." }); } finally { setSaving(false); }
  };

  return <div className="container-fluid px-0 points-page">
    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <h4 className="mb-0 d-flex align-items-center gap-2"><i className="bi bi-award-fill text-warning" aria-hidden="true" /><span>Points</span></h4>
      <button className="btn btn-outline-light btn-sm points-refresh" onClick={load} disabled={loading} type="button">{loading ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="bi bi-arrow-repeat" aria-hidden="true" />}<span>Refresh</span></button>
    </div>
    {msg && <div className={`alert alert-${msg.type} py-2 points-alert`} role="status">{msg.text}</div>}
    <div className="row g-3">
      <div className="col-lg-7"><div className="card bg-dark text-light border-secondary points-card"><div className="card-body">
        <label className="form-label d-flex align-items-center gap-2" htmlFor="points-search"><i className="bi bi-person-badge-fill text-info" aria-hidden="true" /><span>Search user/trainer (name / phone)</span></label>
        <input id="points-search" className="form-control admin-search-input mb-3" placeholder="Type name or phone..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="points-list"><table className="table table-dark table-hover align-middle mb-0"><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th className="text-end">Points</th></tr></thead><tbody>
          {filteredUsers.map((user) => { const active = String(user.id) === String(selectedUserId); const points = pointsMap[String(user.id)]?.points ?? 0; return <tr key={user.id} onClick={() => selectUser(user)} className={active ? "table-active points-row-selected" : ""} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectUser(user); } }}><td>{user.name}</td><td className="text-capitalize">{user.role || "-"}</td><td>{user.phone}</td><td className="text-end fw-semibold">{Number(points).toLocaleString()}</td></tr>; })}
          {!filteredUsers.length && !loading && <tr><td colSpan={4} className="text-center text-secondary py-4">No users found.</td></tr>}
        </tbody></table></div>
      </div></div></div>
      <div className="col-lg-5"><div className="card bg-dark text-light border-secondary points-card"><div className="card-body">
        <h5 className="card-title d-flex align-items-center gap-2"><i className="bi bi-sliders2-vertical text-primary" aria-hidden="true" /><span>Adjust Points</span></h5>
        {!selectedUser ? <p className="text-secondary mb-0 points-empty">Select a user from the list to view and update points.</p> : <>
          <div className="mb-3 points-user-summary"><div className="small text-secondary">User</div><div className="fw-semibold">{selectedUser.name}</div><div className="small text-secondary text-capitalize">{selectedUser.role || "-"}</div><div className="small text-secondary">{selectedUser.phone}</div></div>
          <div className="mb-3"><div className="small text-secondary d-flex align-items-center gap-2"><i className="bi bi-wallet2" aria-hidden="true" /><span>Current points</span></div><div className="display-6 fw-semibold points-current-value">{Number(currentPoints).toLocaleString()}</div></div>
          <label className="form-label d-flex align-items-center gap-2" htmlFor="points-new-value"><i className="bi bi-pencil-square text-warning" aria-hidden="true" /><span>New points value</span></label>
          <input id="points-new-value" type="number" min="0" step="1" className="form-control mb-3" value={nextPoints} onChange={(event) => setNextPoints(event.target.value)} />
          <button className="btn btn-primary w-100 points-save" onClick={updatePoints} disabled={saving} type="button">{saving ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Updating...</> : <><i className="bi bi-check2-circle me-2" aria-hidden="true" />Update Points</>}</button>
        </>}
      </div></div></div>
    </div>
  </div>;
}
