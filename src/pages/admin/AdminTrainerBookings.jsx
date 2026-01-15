import React, { useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";

function moneyMMK(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-US") + " MMK";
}

function parseBackendDateTime(s) {
  // backend: "YYYY-MM-DD HH:mm:ss" (or null)
  if (!s) return null;
  // Convert to ISO-ish for JS parsing
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateTimeVideoStyle(s) {
  // "2026-01-11 10:30 AM"
  const d = parseBackendDateTime(s);
  if (!d) return "-";

  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());

  let hours = d.getHours();
  const minutes = pad2(d.getMinutes());
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${y}-${m}-${day} ${hours}:${minutes} ${ampm}`;
}

export default function AdminTrainerBookings() {
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [msg, setMsg] = useState(null);

  const [bookings, setBookings] = useState([]);

  // options for create modal
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [statusOptions, setStatusOptions] = useState(["pending", "confirmed", "cancelled"]);
  const [paidOptions, setPaidOptions] = useState(["unpaid", "paid"]);
  const [defaultPrice, setDefaultPrice] = useState(30000);

  // filters
  const [filterPaid, setFilterPaid] = useState("all");     // all | paid | unpaid
  const [filterStatus, setFilterStatus] = useState("all"); // all | pending | confirmed | cancelled

  // modal
  const [showModal, setShowModal] = useState(false);

  // form fields
  const [memberId, setMemberId] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [sessionDatetime, setSessionDatetime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [sessionsCount, setSessionsCount] = useState("1");
  const [pricePerSession, setPricePerSession] = useState("");
  const [status, setStatus] = useState("pending");
  const [paidStatus, setPaidStatus] = useState("unpaid");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setMemberId("");
    setTrainerId("");
    setSessionDatetime("");
    setDurationMinutes("60");
    setSessionsCount("1");
    setPricePerSession(""); // will set default on options load
    setStatus("pending");
    setPaidStatus("unpaid");
    setNotes("");
  };

  const total = useMemo(() => {
    const s = Number(sessionsCount);
    const p = Number(pricePerSession || defaultPrice);
    if (Number.isNaN(s) || Number.isNaN(p)) return 0;
    return Math.max(0, s) * Math.max(0, p);
  }, [sessionsCount, pricePerSession, defaultPrice]);

  const loadBookings = async () => {
    setMsg(null);
    setLoading(true);
    try {
      const res = await axiosClient.get("/trainer-bookings");
      const list = Array.isArray(res.data?.bookings) ? res.data.bookings : [];
      setBookings(list);
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to load trainer bookings.",
      });
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = async () => {
    setMsg(null);
    setShowModal(true);
    resetForm();

    setOptionsLoading(true);
    try {
      const res = await axiosClient.get("/trainer-bookings/options");
      setMembers(Array.isArray(res.data?.members) ? res.data.members : []);
      setTrainers(Array.isArray(res.data?.trainers) ? res.data.trainers : []);
      setDefaultPrice(Number(res.data?.default_price_per_session ?? 30000));
      setStatusOptions(Array.isArray(res.data?.status_options) ? res.data.status_options : ["pending", "confirmed", "cancelled"]);
      setPaidOptions(Array.isArray(res.data?.paid_status_options) ? res.data.paid_status_options : ["unpaid", "paid"]);

      // default in UI
      setPricePerSession(String(res.data?.default_price_per_session ?? 30000));
      setStatus("pending");
      setPaidStatus("unpaid");
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to load booking options.",
      });
    } finally {
      setOptionsLoading(false);
    }
  };

  const createBooking = async () => {
    setMsg(null);

    if (!memberId) return setMsg({ type: "danger", text: "Please select a member." });
    if (!trainerId) return setMsg({ type: "danger", text: "Please select a trainer." });
    if (!sessionDatetime) return setMsg({ type: "danger", text: "Please choose session date & time." });

    const duration = Number(durationMinutes);
    const sessions = Number(sessionsCount);
    const price = Number(pricePerSession);

    if (Number.isNaN(duration) || duration <= 0) return setMsg({ type: "danger", text: "Duration must be a valid number." });
    if (Number.isNaN(sessions) || sessions <= 0) return setMsg({ type: "danger", text: "Sessions must be a valid number." });
    if (Number.isNaN(price) || price < 0) return setMsg({ type: "danger", text: "Price per session must be valid." });

    setBusyKey("create");
    try {
      // datetime-local -> backend "YYYY-MM-DD HH:mm:ss"
      const session_datetime = sessionDatetime.replace("T", " ") + ":00";

      const payload = {
        member_id: Number(memberId),
        trainer_id: Number(trainerId),
        session_datetime,
        duration_minutes: duration,
        sessions_count: sessions,
        price_per_session: price,
        status,
        paid_status: paidStatus,
        notes: notes || null,
      };

      const res = await axiosClient.post("/trainer-bookings", payload);

      setShowModal(false);
      setMsg({ type: "success", text: res?.data?.message || "Booking created successfully." });
      await loadBookings();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to create booking.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const markPaid = async (id) => {
    setMsg(null);
    setBusyKey(`paid-${id}`);
    try {
      const res = await axiosClient.patch(`/trainer-bookings/${id}/mark-paid`);
      setMsg({ type: "success", text: res?.data?.message || "Marked as paid." });
      await loadBookings();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to mark as paid.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const statusBadge = (s) => {
    const v = String(s || "").toLowerCase();
    if (v === "confirmed") return <span className="badge bg-success">Confirmed</span>;
    if (v === "cancelled") return <span className="badge bg-secondary">Cancelled</span>;
    return <span className="badge bg-warning text-dark">Pending</span>;
  };

  const paidBadge = (s) => {
    const v = String(s || "").toLowerCase();
    if (v === "paid") return <span className="badge bg-success">Paid</span>;
    return <span className="badge bg-danger">Unpaid</span>;
  };

  // ✅ filter + sort (exact ordering: session time newest first)
  const filteredBookings = useMemo(() => {
    const paidF = String(filterPaid).toLowerCase();
    const statusF = String(filterStatus).toLowerCase();

    const list = bookings.filter((b) => {
      const paid = String(b?.paid_status || "").toLowerCase();
      const st = String(b?.status || "").toLowerCase();

      if (paidF !== "all" && paid !== paidF) return false;
      if (statusF !== "all" && st !== statusF) return false;
      return true;
    });

    // sort desc by session_datetime
    list.sort((a, b) => {
      const da = parseBackendDateTime(a?.session_datetime)?.getTime() ?? 0;
      const db = parseBackendDateTime(b?.session_datetime)?.getTime() ?? 0;
      return db - da;
    });

    return list;
  }, [bookings, filterPaid, filterStatus]);

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Trainer Bookings</h4>
          <div className="admin-muted">Create trainer sessions, track status and payments.</div>
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-primary" onClick={openCreateModal} disabled={loading}>
            <i className="bi bi-plus-circle me-2"></i> Create Booking
          </button>

          <button className="btn btn-outline-light" onClick={loadBookings} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div style={{ minWidth: 180 }}>
          <label className="form-label mb-1">Paid Filter</label>
          <select
            className="form-select bg-dark"
            value={filterPaid}
            onChange={(e) => setFilterPaid(e.target.value)}
          >
            <option value="all" className="text-light fw-bold">All</option>
            <option value="paid" className="text-light fw-bold">Paid</option>
            <option value="unpaid" className="text-light fw-bold">Unpaid</option>
          </select>
        </div>

        <div style={{ minWidth: 220 }}>
          <label className="form-label mb-1">Status Filter</label>
          <select
            className="form-select bg-dark"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all" className="fw-bold text-white">All</option>
            <option value="pending" className="fw-bold text-white">Pending</option>
            <option value="confirmed" className="fw-bold text-white">Confirmed</option>
            <option value="cancelled" className="fw-bold text-white">Cancelled</option>
          </select>
        </div>

        <button
          className="btn btn-outline-primary"
          onClick={() => {
            setFilterPaid("all");
            setFilterStatus("all");
          }}
        >
          Clear Filters
        </button>

        <div className="ms-auto text-muted">
          Showing <b>{filteredBookings.length}</b> booking(s)
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-dark table-hover align-middle mb-0">
          <thead>
            <tr>
              <th style={{ width: 70 }}>ID</th>
              <th>User</th>
              <th>User Phone</th>
              <th>Trainer</th>
              <th>Trainer Phone</th>
              <th>Session Time</th>
              <th>Paid Time</th>
              <th style={{ width: 90 }}>Sessions</th>
              <th style={{ width: 120 }}>Total</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 100 }}>Paid</th>
              <th style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredBookings.length === 0 ? (
              <tr>
                <td colSpan="12" className="text-center text-muted py-4">
                  {loading ? "Loading..." : "No bookings found."}
                </td>
              </tr>
            ) : (
              filteredBookings.map((b) => {
                const isPaid = String(b.paid_status || "").toLowerCase() === "paid";

                return (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td>{b.member_name || "-"}</td>
                    <td>{b.member_phone || "-"}</td>
                    <td>{b.trainer_name || "-"}</td>
                    <td>{b.trainer_phone || "-"}</td>

                    {/* ✅ exact formatting */}
                    <td>{formatDateTimeVideoStyle(b.session_datetime)}</td>
                    <td>{b.paid_at ? formatDateTimeVideoStyle(b.paid_at) : "-"}</td>

                    <td>{b.sessions_count ?? "-"}</td>
                    <td>{moneyMMK(b.total_price)}</td>
                    <td>{statusBadge(b.status)}</td>
                    <td>{paidBadge(b.paid_status)}</td>

                    <td>
                      <button
                        className="btn btn-sm btn-success"
                        disabled={isPaid || busyKey === `paid-${b.id}`}
                        onClick={() => markPaid(b.id)}
                        title={isPaid ? "Already paid" : "Mark as paid"}
                      >
                        {busyKey === `paid-${b.id}` ? "..." : "Paid"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Create Booking Modal ===== */}
      {showModal && (
        <div
          className="modal fade show"
          style={{ display: "block", background: "rgba(0,0,0,0.6)" }}
          tabIndex="-1"
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
            <div className="modal-content bg-dark text-light">
              <div className="modal-header border-secondary">
                <h5 className="modal-title">Create Trainer Booking</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowModal(false)}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label fw-bold">Member</label>
                    <select
                      className="form-select bg-dark"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      disabled={optionsLoading}
                    >
                      <option value="" className="fw-bold text-white">Select member</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.phone ? `- ${m.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label fw-bold">Trainer</label>
                    <select
                      className="form-select bg-dark"
                      value={trainerId}
                      onChange={(e) => setTrainerId(e.target.value)}
                      disabled={optionsLoading}
                    >
                      <option value="" className="fw-bold text-white">Select trainer</option>
                      {trainers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.phone ? `- ${t.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label fw-bold">Date & Time</label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={sessionDatetime}
                      onChange={(e) => setSessionDatetime(e.target.value)}
                      disabled={optionsLoading}
                    />
                  </div>

                  <div className="col-12 col-md-3">
                    <label className="form-label fw-bold">Duration (min)</label>
                    <input
                      className="form-control"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      disabled={optionsLoading}
                    />
                  </div>

                  <div className="col-12 col-md-3">
                    <label className="form-label fw-bold">Sessions</label>
                    <input
                      className="form-control"
                      value={sessionsCount}
                      onChange={(e) => setSessionsCount(e.target.value)}
                      disabled={optionsLoading}
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label fw-bold">Price per Session (MMK)</label>
                    <input
                      className="form-control"
                      value={pricePerSession}
                      onChange={(e) => setPricePerSession(e.target.value)}
                      disabled={optionsLoading}
                    />
                    <div className="admin-muted mt-1">Default: {moneyMMK(defaultPrice)}</div>
                  </div>

                  <div className="col-12 col-md-3">
                    <label className="form-label fw-bold">Status</label>
                    <select
                      className="form-select bg-dark"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      disabled={optionsLoading}
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12 col-md-3">
                    <label className="form-label fw-bold">Paid Status</label>
                    <select
                      className="form-select bg-dark"
                      value={paidStatus}
                      onChange={(e) => setPaidStatus(e.target.value)}
                      disabled={optionsLoading}
                    >
                      {paidOptions.map((p) => (
                        <option key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12">
                    <label className="form-label fw-bold">Notes</label>
                    <textarea
                      className="form-control admin-search"
                      rows="3"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={optionsLoading}
                      placeholder="Optional notes..."
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

                  <div className="col-12">
                    <div className="d-flex align-items-center justify-content-between p-3 rounded border border-secondary">
                      <div className="admin-muted fw-bold">Total Amount</div>
                      <div className="fs-5 fw-bold">{moneyMMK(total)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer border-secondary">
                <button className="btn btn-outline-light" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={createBooking}
                  disabled={optionsLoading || busyKey === "create"}
                >
                  {busyKey === "create" ? "Saving..." : "Save Booking"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
