import React, { useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";

function moneyMMK(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-US") + " MMK";
}

function normalizeSubscriptions(payload) {
  // backend returns: { subscriptions: [...] }
  if (Array.isArray(payload?.subscriptions)) return payload.subscriptions;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function parseDateOnly(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const dateOnly = s.includes("T") ? s.split("T")[0] : s.split(" ")[0];
  const parts = dateOnly.split("-").map((part) => Number(part));
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function isExpiredByDate(endDateValue) {
  const endDate = parseDateOnly(endDateValue);
  if (!endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > endDate;
}

export default function AdminSubscriptions() {
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  const [subs, setSubs] = useState([]);

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [plans, setPlans] = useState([]);

  const [memberId, setMemberId] = useState("");
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(""); // optional

  const resetForm = () => {
    setMemberId("");
    setPlanId("");
    setStartDate("");
  };

  const load = async () => {
    setMsg(null);
    setLoading(true);
    try {
      const res = await axiosClient.get("/subscriptions");
      setSubs(normalizeSubscriptions(res.data));
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to load subscriptions.",
      });
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = async () => {
    setMsg(null);
    setShowModal(true);
    resetForm();

    // load options: members + plans
    setOptionsLoading(true);
    try {
      const res = await axiosClient.get("/subscriptions/options");
      setMembers(Array.isArray(res.data?.members) ? res.data.members : []);
      setPlans(Array.isArray(res.data?.plans) ? res.data.plans : []);
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to load subscription options.",
      });
      // keep modal open so admin can try again
    } finally {
      setOptionsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setOptionsLoading(false);
  };

  const createSubscription = async () => {
    setMsg(null);

    if (!memberId) {
      setMsg({ type: "danger", text: "Please select a member." });
      return;
    }
    if (!planId) {
      setMsg({ type: "danger", text: "Please select a plan." });
      return;
    }

    try {
      const payload = {
        member_id: Number(memberId),
        membership_plan_id: Number(planId),
      };
      if (startDate) payload.start_date = startDate;

      const res = await axiosClient.post("/subscriptions", payload);

      setShowModal(false);
      setMsg({
        type: "success",
        text: res?.data?.message || "Subscription created successfully.",
      });
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to create subscription.",
      });
    }
  };

  const holdSubscription = async (id) => {
    setMsg(null);
    setBusyId(id);
    try {
      const res = await axiosClient.post(`/subscriptions/${id}/hold`);
      setMsg({ type: "success", text: res?.data?.message || "Subscription placed on hold." });
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to hold subscription.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const resumeSubscription = async (id) => {
    setMsg(null);
    setBusyId(id);
    try {
      const res = await axiosClient.post(`/subscriptions/${id}/resume`);
      setMsg({ type: "success", text: res?.data?.message || "Subscription resumed." });
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to resume subscription.",
      });
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const planMap = useMemo(() => {
    const m = new Map();
    for (const p of plans) m.set(String(p.id), p);
    return m;
  }, [plans]);

  const selectedPlan = useMemo(() => {
    if (!planId) return null;
    return planMap.get(String(planId)) || null;
  }, [planId, planMap]);

  const sortedSubscriptions = useMemo(() => {
    const list = [...subs];
    list.sort((a, b) => {
      const statusA = String(a?.status || "").toLowerCase();
      const statusB = String(b?.status || "").toLowerCase();
      const expiredA = statusA === "expired" || isExpiredByDate(a?.end_date);
      const expiredB = statusB === "expired" || isExpiredByDate(b?.end_date);
      const activeA = statusA === "active" && !expiredA;
      const activeB = statusB === "active" && !expiredB;
      const rankA = activeA ? 0 : expiredA ? 2 : 1;
      const rankB = activeB ? 0 : expiredB ? 2 : 1;
      if (rankA !== rankB) return rankA - rankB;
      return (b?.id ?? 0) - (a?.id ?? 0);
    });
    return list;
  }, [subs]);

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Subscription Management</h4>
          <div className="admin-muted">
            Track active members, hold subscriptions, and resume when they return.
          </div>
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-primary" onClick={openCreateModal} disabled={loading}>
            <i className="bi bi-plus-circle me-2"></i> Add New Subscription
          </button>

          <button className="btn btn-outline-light" onClick={load} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="table-responsive">
        <table className="table table-dark table-hover align-middle mb-0">
          <thead>
            <tr>
              <th style={{ width: 90 }}>ID</th>
              <th>Member</th>
              <th>Member Phone</th>
              <th>Plan</th>
              <th>Details</th>
              <th>Price</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th style={{ width: 140 }}>Action</th>
            </tr>
          </thead>

          <tbody>
            {subs.length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center text-muted py-4">
                  {loading ? "Loading..." : "No subscriptions found."}
                </td>
              </tr>
            ) : (
              sortedSubscriptions.map((s) => {
                const rawStatus = String(s?.status || "");
                const isOnHold = !!s?.is_on_hold;
                const isExpired = rawStatus.toLowerCase() === "expired" || isExpiredByDate(s?.end_date);
                const status = isExpired ? "Expired" : rawStatus || "-";
                const canHold = !isExpired && !isOnHold && rawStatus.toLowerCase() === "active";
                const canResume = !isExpired && isOnHold;

                return (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.member_name || "-"}</td>
                    <td>{s.member_phone || "-"}</td>
                    <td>
                      <span className="badge bg-primary">{s.plan_name || "-"}</span>
                    </td>
                    <td>{s.duration_days ? `${s.duration_days} day(s)` : "-"}</td>
                    <td>{moneyMMK(s.price)}</td>
                    <td>{s.start_date || "-"}</td>
                    <td>{s.end_date || "-"}</td>
                    <td>
                      {status.toLowerCase() === "active" && (
                        <span className="badge bg-success">Active</span>
                      )}
                      {status.toLowerCase() === "on hold" && (
                        <span className="badge bg-warning text-dark">On Hold</span>
                      )}
                      {status.toLowerCase() === "expired" && (
                        <span className="badge bg-secondary">Expired</span>
                      )}
                      {!["active", "on hold", "expired"].includes(status.toLowerCase()) && (
                        <span className="badge bg-info text-dark">{status || "-"}</span>
                      )}
                    </td>
                    <td>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-warning"
                          disabled={!canHold || busyId === s.id}
                          onClick={() => holdSubscription(s.id)}
                          title="Place on hold"
                        >
                          {busyId === s.id ? "..." : "Hold"}
                        </button>

                        <button
                          className="btn btn-sm btn-success"
                          disabled={!canResume || busyId === s.id}
                          onClick={() => resumeSubscription(s.id)}
                          title="Resume subscription"
                        >
                          {busyId === s.id ? "..." : "Resume"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal (same style as Create User modal) */}
      {showModal && (
        <>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content bg-dark text-white">
                <div className="modal-header">
                  <h5 className="modal-title fw-bolder">Add New Subscription</h5>
                  <button
                    className="btn-close btn-close-white"
                    onClick={closeModal}
                    aria-label="Close"
                    disabled={optionsLoading}
                  ></button>
                </div>

                <div className="modal-body">
    <div className="row g-3">
    
    <div className="col-md-4">
      <label className="form-label fw-bold">Member</label>
      <select
        className="form-select bg-dark text-white"
        value={memberId}
        onChange={(e) => setMemberId(e.target.value)}
        disabled={optionsLoading}
      >
        <option value="">Select member</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} {m.phone ? `- ${m.phone}` : ""}
          </option>
        ))}
      </select>
    </div>

    
    <div className="col-md-4">
      <label className="form-label fw-bold">Plan</label>
      <select
        className="form-select bg-dark text-white"
        value={planId}
        onChange={(e) => setPlanId(e.target.value)}
        disabled={optionsLoading}
      >
        <option value="">Select plan</option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>

    {/* Start Date */}
    <div className="col-md-4">
      <label className="form-label fw-bold">Start Date</label>
      <input
        type="date"
        className="form-control bg-dark text-white"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        disabled={optionsLoading}
      />
    </div>
  </div>

  {/* Plan summary */}
  {selectedPlan && (
    <div className="mt-3 p-3 rounded bg-black border">
      <div className="fw-bold">{selectedPlan.name}</div>
      <div className="text-muted">
        Duration: {selectedPlan.duration_days} day(s)
      </div>
      <div className="text-muted">
        Price: {moneyMMK(selectedPlan.price)}
      </div>
    </div>
  )}
</div>


                <div className="modal-footer">
                  <button
                    className="btn btn-outline-light"
                    onClick={closeModal}
                    disabled={optionsLoading}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={createSubscription}
                    disabled={optionsLoading}
                  >
                    {optionsLoading ? "Loading..." : "Save Subscription"}
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
