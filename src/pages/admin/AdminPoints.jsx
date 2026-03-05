import React, { useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";
import { getPoints, upsertUserPoints } from "../../api/pointsApi";

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

export default function AdminPoints() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [pointsMap, setPointsMap] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [nextPoints, setNextPoints] = useState("");

  const load = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const [usersRes, points] = await Promise.all([axiosClient.get("/users"), getPoints()]);
      const userRows = normalizeUsers(usersRes?.data)
        .map(normalizeUser)
        .filter((u) => u.id && allowedRoles.has(u.role));

      const mappedPoints = points.reduce((acc, item) => {
        acc[String(item.user_id)] = item;
        return acc;
      }, {});

      const usersFromPoints = points
        .filter((item) => item.user_id)
        .map((item) =>
          normalizeUser({
            id: item.user_id,
            name: item.user_name,
            role: item.user_role,
          })
        )
        .filter((u) => allowedRoles.has(u.role));

      const mergedUsers = [...userRows, ...usersFromPoints].reduce((acc, user) => {
        const key = String(user.id);
        if (!acc[key]) {
          acc[key] = user;
          return acc;
        }

        // Keep richer values when duplicate user exists from different sources.
        acc[key] = {
          ...acc[key],
          ...user,
          name: acc[key].name !== "-" ? acc[key].name : user.name,
          phone: acc[key].phone !== "-" ? acc[key].phone : user.phone,
        };
        return acc;
      }, {});

      setUsers(Object.values(mergedUsers));
      setPointsMap(mappedPoints);
    } catch (error) {
      setMsg({ type: "danger", text: error?.response?.data?.message || "Failed to load points data." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.name, u.phone].some((value) => String(value || "").toLowerCase().includes(q)));
  }, [users, query]);

  const selectedUser = useMemo(
    () => users.find((u) => String(u.id) === String(selectedUserId)) || null,
    [users, selectedUserId]
  );

  const currentPoints = selectedUser ? pointsMap[String(selectedUser.id)]?.points ?? 0 : 0;

  const handleSelectUser = (user) => {
    setSelectedUserId(user.id);
    setNextPoints(String(pointsMap[String(user.id)]?.points ?? 0));
    setMsg(null);
  };

  const handleUpdatePoints = async () => {
    if (!selectedUser) {
      setMsg({ type: "danger", text: "Please choose a user first." });
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      const updated = await upsertUserPoints({
        userId: selectedUser.id,
        points: Number(nextPoints),
        note: "Adjusted by admin panel",
      });

      setPointsMap((prev) => ({
        ...prev,
        [String(selectedUser.id)]: {
          ...(prev[String(selectedUser.id)] || {}),
          ...updated,
          user_id: selectedUser.id,
        },
      }));

      setMsg({ type: "success", text: `Points updated for ${selectedUser.name}.` });
    } catch (error) {
      setMsg({ type: "danger", text: error?.response?.data?.message || "Failed to update points." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-fluid px-0">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <h4 className="mb-0 d-flex align-items-center gap-2">
          <i className="bi bi-award-fill text-warning" aria-hidden="true"></i>
          <span>Points</span>
        </h4>
        <button className="btn btn-outline-light btn-sm" onClick={load} disabled={loading}>
          <i className="bi bi-arrow-repeat me-1" aria-hidden="true"></i>Refresh
        </button>
      </div>

      {msg && <div className={`alert alert-${msg.type} py-2`}>{msg.text}</div>}

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="card bg-dark text-light border-secondary">
            <div className="card-body">
              <label className="form-label d-flex align-items-center gap-2">
                <i className="bi bi-person-badge-fill text-info" aria-hidden="true"></i>
                <span>Search user/trainer (name / phone)</span>
              </label>
              <input
                className="form-control admin-search-input mb-3"
                placeholder="Type name or phone..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                <table className="table table-dark table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Phone</th>
                      <th className="text-end">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const active = String(user.id) === String(selectedUserId);
                      const points = pointsMap[String(user.id)]?.points ?? 0;
                      return (
                        <tr
                          key={user.id}
                          onClick={() => handleSelectUser(user)}
                          style={{ cursor: "pointer" }}
                          className={active ? "table-active" : ""}
                        >
                          <td>{user.name}</td>
                          <td className="text-capitalize">{user.role || "-"}</td>
                          <td>{user.phone}</td>
                          <td className="text-end fw-semibold">{points}</td>
                        </tr>
                      );
                    })}
                    {!filteredUsers.length && !loading && (
                      <tr>
                        <td colSpan={4} className="text-center text-secondary py-4">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <div className="card bg-dark text-light border-secondary">
            <div className="card-body">
              <h5 className="card-title d-flex align-items-center gap-2">
                <i className="bi bi-sliders2-vertical text-primary" aria-hidden="true"></i>
                <span>Adjust Points</span>
              </h5>
              {!selectedUser ? (
                <p className="text-secondary mb-0">Select a user from the list to view and update points.</p>
              ) : (
                <>
                  <div className="mb-2">
                    <div className="small text-secondary">User</div>
                    <div className="fw-semibold">{selectedUser.name}</div>
                    <div className="small text-secondary text-capitalize">{selectedUser.role || "-"}</div>
                    <div className="small text-secondary">{selectedUser.phone}</div>
                  </div>

                  <div className="mb-2">
                    <div className="small text-secondary d-flex align-items-center gap-2">
                      <i className="bi bi-wallet2" aria-hidden="true"></i>
                      <span>Current points</span>
                    </div>
                    <div className="display-6 fw-semibold">{currentPoints}</div>
                  </div>

                  <label className="form-label d-flex align-items-center gap-2">
                    <i className="bi bi-pencil-square text-warning" aria-hidden="true"></i>
                    <span>New points value</span>
                  </label>
                  <input
                    type="number"
                    className="form-control mb-3"
                    value={nextPoints}
                    onChange={(e) => setNextPoints(e.target.value)}
                  />

                  <button className="btn btn-primary w-100" onClick={handleUpdatePoints} disabled={saving}>
                    <i className="bi bi-check2-circle me-2" aria-hidden="true"></i>
                    {saving ? "Updating..." : "Update Points"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
