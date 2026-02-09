import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../api/axiosClient";

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

const emptyCreate = {
  user_id: "",
  card_id: "",
  name: "",
  email: "",
  phone: "",
  role: "user", // only user/trainer allowed by /api/admin/register
  password: "",
  password_confirmation: "",
};

const emptyEdit = {
  id: null,
  user_id: "",
  name: "",
  email: "",
  phone: "",
  role: "user",
  password: "",
  password_confirmation: "",
};

function roleBadge(roleRaw) {
  const role = (roleRaw || "").toLowerCase();
  if (role === "administrator" || role === "admin") return <span className="badge bg-danger">Admin</span>;
  if (role === "trainer") return <span className="badge bg-info text-dark">Trainer</span>;
  return <span className="badge bg-secondary">User</span>;
}

function getUserRecordId(user) {
  const directId = user?.id ?? user?.user?.id ?? user?.member_id ?? null;
  if (directId !== null && directId !== undefined) {
    return directId;
  }
  if (user?.user_id !== null && user?.user_id !== undefined) {
    return String(user.user_id);
  }
  return null;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);

  // Pagination (client-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [createForm, setCreateForm] = useState({ ...emptyCreate });
  const [editForm, setEditForm] = useState({ ...emptyEdit });
  const [editOriginal, setEditOriginal] = useState({ ...emptyEdit });

  const handleCreateUserIdChange = (value) => {
    const sanitized = value.replace(/\D/g, "").slice(0, 5);
    setCreateForm((prev) => ({ ...prev, user_id: sanitized }));
  };

  const load = async () => {
    setMsg(null);
    setLoading(true);
    try {
      // ✅ API route that actually exists
      const res = await axiosClient.get("/users");
      setUsers(normalizeList(res.data));
      setPage(1);
    } catch (e) {
      setMsg({
        type: "danger",
        text:
          e?.response?.data?.message ||
          `Failed to load users (status: ${e?.response?.status || "unknown"}).`,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const vals = [u?.user_id, u?.name, u?.email, u?.phone, u?.role].map((v) =>
        (v || "").toString().toLowerCase()
      );
      return vals.some((v) => v.includes(q));
    });
  }, [users, query]);

  useEffect(() => setPage(1), [query, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const goTo = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  // --------- Create (uses /api/admin/register) ----------
  const openCreate = () => {
    setMsg(null);
    setCreateForm({ ...emptyCreate });
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setSavingCreate(false);
  };

  const submitCreate = async () => {
    setMsg(null);
    setSavingCreate(true);

    try {
       if (!createForm.user_id) {
        setMsg({ type: "danger", text: "User ID is required." });
        setSavingCreate(false);
        return;
      }
      // ✅ API route exists: POST /api/admin/register (administrator middleware)
      await axiosClient.post("/admin/register", {
        user_id: createForm.user_id || undefined,
        card_id: createForm.card_id || undefined,
        name: createForm.name,
        email: createForm.email,
        phone: createForm.phone,
        role: createForm.role, // allowed: trainer,user
        password: createForm.password,
        password_confirmation: createForm.password_confirmation,
      });

      setMsg({ type: "success", text: "User created successfully." });
      setShowCreate(false);
      await load();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Create failed." });
    } finally {
      setSavingCreate(false);
    }
  };

  // --------- Edit (needs PATCH /api/users/{id} which you must add) ----------
  const openEdit = (u) => {
    setMsg(null);
    const recordId = getUserRecordId(u);
    if (!recordId) {
      setMsg({ type: "danger", text: "This user is missing a server ID. Please refresh the list." });
      return;
    }
    const next = {
      id: recordId,
      user_id: u?.user_id ?? "",
      name: u?.name || "",
      email: u?.email || "",
      phone: u?.phone || "",
      role: (u?.role || "user").toLowerCase(),
      password: "",
      password_confirmation: "",
     };
    setEditForm(next);
    setEditOriginal(next);
    setShowEdit(true);
  };

  const closeEdit = () => {
    setShowEdit(false);
    setSavingEdit(false);
  };

  const submitEdit = async () => {
    setMsg(null);
    setSavingEdit(true);

    try {
      if (!editForm.id) {
        setMsg({ type: "danger", text: "Missing user id for this record." });
        setSavingEdit(false);
        return;
      }
      const trimmedPassword = editForm.password.trim();
      const trimmedConfirmation = editForm.password_confirmation.trim();
      if (!trimmedPassword && trimmedConfirmation) {
        setMsg({ type: "danger", text: "Please enter a new password to confirm." });
        setSavingEdit(false);
        return;
      }
      if (trimmedPassword && trimmedPassword !== trimmedConfirmation) {
        setMsg({ type: "danger", text: "Passwords do not match." });
        setSavingEdit(false);
        return;
      }

      const payload = {};
      const trimmedName = editForm.name.trim();
      const trimmedEmail = editForm.email.trim();
      const trimmedPhone = editForm.phone.trim();
      const originalName = editOriginal.name.trim();
      const originalEmail = editOriginal.email.trim();
      const originalPhone = editOriginal.phone.trim();
      const originalRole = editOriginal.role.trim();

      if (trimmedName !== originalName) payload.name = trimmedName;
      if (trimmedEmail !== originalEmail) payload.email = trimmedEmail;
      if (trimmedPhone !== originalPhone) payload.phone = trimmedPhone;
      if (editForm.role !== originalRole) payload.role = editForm.role;

      if (trimmedPassword) {
        payload.password = trimmedPassword;
        payload.password_confirmation = trimmedConfirmation;
      }

      if (Object.keys(payload).length === 0) {
        setMsg({ type: "danger", text: "No changes detected." });
        setSavingEdit(false);
        return;
      }

      // ⚠️ This route does NOT exist yet in your API. Add backend in section (2).
      await axiosClient.patch(`/users/${editForm.id}`, payload);

      setMsg({ type: "success", text: "User updated successfully." });
      setShowEdit(false);
      await load();
    } catch (e) {
      if (e?.response?.status === 404) {
        setMsg({
          type: "danger",
          text: "This user no longer exists. Please refresh the list.",
        });
        setShowEdit(false);
        await load();
        return;
      }
      setMsg({
        type: "danger",
        text:
          e?.response?.data?.message ||
          `Update failed (status: ${e?.response?.status || "unknown"}). Add patch API route.`,
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // --------- Delete / Restore ----------
  const destroy = async (id) => {
    if (!id) {
      setMsg({ type: "danger", text: "This user is missing a server ID. Please refresh the list." });
      return;
    }
    if (!confirm("Delete this user?")) return;

    setMsg(null);
    try {
       try {
        await axiosClient.delete(`/users/${id}`);
      } catch (softDeleteError) {
        if (softDeleteError?.response?.status !== 404) {
          console.warn("Soft delete failed, attempting force delete anyway.", softDeleteError);
        }
      }

      await axiosClient.delete(`/users/${id}/force`);
      setMsg({ type: "success", text: "User deleted." });
      await load();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Delete failed." });
    }
  };

  const restore = async (id) => {
    if (!id) {
      setMsg({ type: "danger", text: "This user is missing a server ID. Please refresh the list." });
      return;
    }

    setMsg(null);
    try {
      await axiosClient.post(`/users/${id}/restore`);
      setMsg({ type: "success", text: "User restored." });
      await load();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Restore failed." });
    }
  };

  const openHistory = (u) => {
    const recordId = getUserRecordId(u) ?? u?.user_id;
    if (!recordId) {
      setMsg({ type: "danger", text: "This user is missing a server ID. Please refresh the list." });
      return;
    }
    navigate(`/admin/users/${recordId}/history`, { state: { user: u } });
  };


  return (
    <div className="admin-card p-4">
      {/* Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h4 className="mb-1">Users Mangement</h4>
          
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-outline-light" onClick={load} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-2"></i>{loading ? "Loading..." : "Refresh"}
          </button>

          {/* ✅ Top-right Create button */}
          <button className="btn btn-primary" onClick={openCreate}>
            <i className="bi bi-person-plus me-2"></i>Create User
          </button>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Search + page size */}
      <div className="row g-2 align-items-center mb-3">
        <div className="col-md-6">
          <input
            className="form-control admin-search"
            placeholder="Search name / email / phone / role"
            value={query}
            autoComplete="new-password"
            onChange={(e) => setQuery(e.target.value)}
          />
          <style>
    {`
      .admin-search::placeholder {
        color: #ffffff !important;
        font-weight: 600;
        opacity: 1; /* Firefox fix */
      }
    `}
  </style>
        </div>

        <div className="col-md-6 d-flex justify-content-md-end gap-2">
          <div className="d-flex align-items-center gap-2">
            <span className="text-muted small">Rows</span>
            <select
              className="form-select form-select-sm bg-dark"
              style={{ width: 90 }}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={5} className="text-light fw-bold">5</option>
              <option value={10} className="text-light fw-bold">10</option>
              <option value={20} className="text-light fw-bold">20</option>
              <option value={50} className="text-light fw-bold">50</option>
            </select>
          </div>

          <div className="text-muted small align-self-center">
            Total: <b>{filtered.length}</b>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-responsive">
        <table className="table table-dark table-hover align-middle mb-0">
          <thead>
            <tr>
              <th style={{ width: 120 }}>User ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th style={{ width: 140 }}>Role</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 130 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center text-muted py-4">
                  {loading ? "Loading..." : "No users found."}
                </td>
              </tr>
            ) : (
              pageItems.map((u) => {
                const recordId = getUserRecordId(u);
                const userId = u?.user_id ?? "-";
                const rowKey = recordId ?? userId ?? Math.random();
                const isDeleted = !!u?.deleted_at;

                return (
                   <tr
                     key={rowKey}
                     onClick={() => openHistory(u)}
                     style={{ cursor: "pointer" }}
                     title="Click to view user history"
                   >
                    <td>{userId}</td>
                    <td>{u?.name ?? "-"}</td>
                    <td className="text-break">{u?.email ?? "-"}</td>
                    <td>{u?.phone ?? "-"}</td>
                    <td>{roleBadge(u?.role)}</td>
                    <td>
                      {isDeleted ? (
                        <span className="badge bg-warning text-dark">Deleted</span>
                      ) : (
                        <span className="badge bg-success">Active</span>
                      )}
                    </td>
                    <td
  style={{
    verticalAlign: "middle",
  }}
>
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      flexWrap: "nowrap",
      whiteSpace: "nowrap",
      minHeight: "100%",
    }}
  >
    <button
      className="btn btn-sm btn-outline-info"
      onClick={(event) => {
        event.stopPropagation();
        openEdit(u);
      }}
      disabled={isDeleted}
      title={isDeleted ? "Restore user first to update" : "Update"}
      style={{ minWidth: 70 }}
    >
      Update
    </button>

        {isDeleted ? (
      <button
        className="btn btn-sm btn-outline-warning"
        onClick={(event) => {
          event.stopPropagation();
          restore(recordId ?? userId);
        }}
        style={{ minWidth: 70 }}
      >
        Restore
      </button>
    ) : (
      <button
        className="btn btn-sm btn-outline-danger"
        onClick={(event) => {
          event.stopPropagation();
          destroy(recordId ?? userId);
        }}
        style={{ minWidth: 70 }}
      >
        Delete
      </button>
    )}

  </div>
</td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
        <div className="text-muted small">
          Page <b>{page}</b> of <b>{totalPages}</b>
        </div>

        <div className="btn-group">
          <button className="btn btn-outline-light btn-sm fw-bold" onClick={() => goTo(1)} disabled={page === 1}>
            « First
          </button>
          <button className="btn btn-outline-light btn-sm fw-bold" onClick={() => goTo(page - 1)} disabled={page === 1}>
            ‹ Prev
          </button>
          <button className="btn btn-outline-light btn-sm fw-bold" onClick={() => goTo(page + 1)} disabled={page === totalPages}>
            Next ›
          </button>
          <button className="btn btn-outline-light btn-sm fw-bold" onClick={() => goTo(totalPages)} disabled={page === totalPages}>
            Last »
          </button>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content bg-dark text-white">
                <div className="modal-header">
                  <h5 className="modal-title fw-bold">Create User</h5>
                  <button className="btn-close btn-close-white" onClick={closeCreate}></button>
                </div>

                <div className="modal-body">
                  <div className="mb-2">
                    <label className="form-label fw-bold">User ID</label>
                    <input
                      className="form-control"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={5}
                      value={createForm.user_id}
                      onChange={(e) => handleCreateUserIdChange(e.target.value)}
                      placeholder="Up to 5 digits"
                      required
                    />
                  </div>
                  <div className="mb-2">
                    <label className="form- fw-bold">Name</label>
                    <input className="form-control" value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
                  </div>

                  <div className="mb-2">
                    <label className="form-label fw-bold">Card ID</label>
                    <input
                      className="form-control"
                      value={createForm.card_id}
                      onChange={(e) => setCreateForm({ ...createForm, card_id: e.target.value })}
                      placeholder="RFID card ID (optional)"
                    />
                  </div>

                  <div className="mb-2">
                    <label className="form-label fw-bold">Email</label>
                    <input className="form-control" value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                  </div>

                  <div className="mb-2">
                    <label className="form-label fw-bold">Phone</label>
                    <input className="form-control" value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
                  </div>

                  <div className="mb-2">
                    <label className="form-label fw-bold">Role</label>
                    <select className="form-select bg-dark" value={createForm.role}
                      onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                      <option value="user" className="fw-bold text-white">User</option>
                      <option value="trainer" className="fw-bold text-white">Trainer</option>
                    </select>
                    
                  </div>

                  <div className="mb-2">
                    <label className="form-label fw-bold">Password</label>
                    <input type="password" className="form-control" value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
                  </div>

                  <div>
                    <label className="form-label fw-bold">Confirm Password</label>
                    <input type="password" className="form-control" value={createForm.password_confirmation}
                      onChange={(e) => setCreateForm({ ...createForm, password_confirmation: e.target.value })} />
                  </div>

                  
                </div>

                <div className="modal-footer">
                  <button className="btn btn-outline-light" onClick={closeCreate} disabled={savingCreate}>Cancel</button>
                  <button className="btn btn-primary" onClick={submitCreate} disabled={savingCreate}>
                    {savingCreate ? "Saving..." : "Create"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content bg-dark text-white">
                <div className="modal-header">
                  <h5 className="modal-title">Update User</h5>
                  <button className="btn-close btn-close-white" onClick={closeEdit}></button>
                </div>

                <div className="modal-body">
                  <div className="mb-2">
                    <label className="form-label fw-bold">User ID</label>
                    <input
                      className="form-control"
                      value={editForm.user_id || ""}
                      disabled
                      readOnly
                    />
                  </div>
                  <div className="mb-2">
                    <label className="form-label fw-bold">Name</label>
                    <input className="form-control" value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>

                  <div className="mb-2">
                    <label className="form-label fw-bold">Email</label>
                    <input className="form-control" value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                  </div>

                  <div className="mb-2">
                    <label className="form-label fw-bold">Phone</label>
                    <input className="form-control" value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                  </div>

                  <div>
                    <label className="form-label fw-bold">Role</label>
                    <select className="form-select bg-dark" value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                      <option value="user" className="fw-bold text-white">User</option>
                      <option value="trainer" className="fw-bold text-white">Trainer</option>
                    </select>
                  </div>

                  <div className="mt-2">
                    <label className="form-label fw-bold">New Password</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Leave blank to keep current password"
                      value={editForm.password}
                      onChange={(e) =>
                        setEditForm({ ...editForm, password: e.target.value })
                      }
                    />
                  </div>

                  <div className="mt-2">
                    <label className="form-label fw-bold">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Leave blank to keep current password"
                      value={editForm.password_confirmation}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          password_confirmation: e.target.value,
                        })
                      }
                    />
                  </div> 
                </div>

                <div className="modal-footer">
                  <button className="btn btn-outline-light" onClick={closeEdit} disabled={savingEdit}>Cancel</button>
                  <button className="btn btn-primary" onClick={submitEdit} disabled={savingEdit}>
                    {savingEdit ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  );
}
