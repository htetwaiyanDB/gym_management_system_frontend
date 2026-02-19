import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../api/axiosClient";

function moneyMMK(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-US") + " MMK";
}

function normalizeList(payload) {
  if (Array.isArray(payload?.class_subscriptions)) return payload.class_subscriptions;
  if (Array.isArray(payload?.subscriptions)) return payload.subscriptions;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

function isClassPlanName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .includes("class");
}

function isClassPlan(plan) {
  if (!plan) return false;
  const type = String(plan?.type || plan?.plan_type || plan?.category || "")
    .trim()
    .toLowerCase();
  if (type === "class") return true;
  return isClassPlanName(
    plan?.name ||
      plan?.plan_name ||
      plan?.title ||
      plan?.membership_plan_name ||
      plan?.class_plan_name,
  );
}

function planIdOf(plan) {
  return plan?.id ?? plan?.plan_id ?? plan?.membership_plan_id ?? plan?.class_plan_id ?? plan?.class_package_id;
}

function planNameOf(plan) {
  return plan?.name ?? plan?.plan_name ?? plan?.title ?? plan?.membership_plan_name ?? plan?.class_plan_name;
}

function isClassSubscription(record) {
  return isClassPlanName(
    record?.membership_plan_name ||
      record?.plan_name ||
      record?.class_plan_name ||
      record?.class_package_name,
  );
}

function normalizeOptions(payload) {
  const members = Array.isArray(payload?.members) ? payload.members : [];
  const plans =
    (Array.isArray(payload?.class_plans) && payload.class_plans) ||
    (Array.isArray(payload?.membership_plans) && payload.membership_plans) ||
    (Array.isArray(payload?.plans) && payload.plans) ||
    (Array.isArray(payload?.class_packages) && payload.class_packages) ||
    (Array.isArray(payload?.packages) && payload.packages) ||
    [];
  return { members, plans };
}

function pickDurationDays(source) {
  const raw =
    source?.duration_days ??
    source?.membership_plan_duration_days ??
    source?.plan_duration_days ??
    source?.durationDays ??
    source?.duration ??
    source?.days ??
    source?.membership_plan?.duration_days ??
    source?.membershipPlan?.duration_days ??
    source?.plan?.duration_days;

  const num = Number(raw);
  if (raw === null || raw === undefined || raw === "") return null;
  if (Number.isNaN(num)) return null;
  return num;
}

function formatDurationDays(source) {
  const days = pickDurationDays(source);
  if (days === null) return "-";
  return `${days} day(s)`;
}

async function requestWithFallback(requests) {
  let latestError = null;
  for (const run of requests) {
    try {
      return await run();
    } catch (error) {
      latestError = error;
      if (error?.response?.status !== 404) throw error;
    }
  }
  throw latestError || new Error("Request failed.");
}

export default function AdminClassSubscriptions() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [records, setRecords] = useState([]);
  const [members, setMembers] = useState([]);
  const [plans, setPlans] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState("");

  const resetForm = () => {
    setMemberId("");
    setPlanId("");
    setStartDate("");
  };

  const parseDateOnly = (value) => {
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
  };

  const isExpiredByDate = (endDateValue) => {
    const endDate = parseDateOnly(endDateValue);
    if (!endDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today > endDate;
  };

  const loadRecords = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await axiosClient.get("/subscriptions");
      const classRecords = normalizeList(res.data).filter(isClassSubscription);
      setRecords(classRecords);
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to load class subscriptions." });
    } finally {
      setLoading(false);
    }
  };

  const loadOptions = async () => {
    const optionsRes = await requestWithFallback([
      () => axiosClient.get("/subscriptions/options"),
      () => axiosClient.get("/class-subscriptions/options"),
    ]);

    const { members: memberList, plans: planList } = normalizeOptions(optionsRes.data);

    const filteredClassPlans = planList.filter(isClassPlan);
    const candidatePlans = filteredClassPlans.length ? filteredClassPlans : planList;

    const normalizedPlans = candidatePlans
      .map((plan) => ({
        ...plan,
        id: planIdOf(plan),
        name: planNameOf(plan),
        duration_days: pickDurationDays(plan),
      }))
      .filter((plan) => plan.id !== null && plan.id !== undefined);


    setMembers(memberList);
    setPlans(normalizedPlans);

    if (normalizedPlans.length === 1) {
      setPlanId(String(normalizedPlans[0].id || ""));
    }
  };

  const openCreate = async () => {
    resetForm();
    setShowModal(true);
    try {
      await loadOptions();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to load create options." });
    }
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const selectedPlan = useMemo(() => plans.find((p) => String(planIdOf(p)) === String(planId)) || null, [plans, planId]);

  const save = async () => {
    if (!memberId) return setMsg({ type: "danger", text: "Please select a member." });
    if (!planId) return setMsg({ type: "danger", text: "Please select a class package." });

    const parsedPlanId = Number(planId);
    if (Number.isNaN(parsedPlanId)) {
      return setMsg({ type: "danger", text: "Class plan is missing from options. Please create a Class plan first." });
    }

    setSaving(true);
    setMsg(null);

    const payload = {
      member_id: Number(memberId),
      membership_plan_id: parsedPlanId,
      class_plan_id: parsedPlanId,
      class_package_id: parsedPlanId,
      plan_id: parsedPlanId,
    };

    if (startDate) payload.start_date = startDate;
    if (selectedPlan?.price !== undefined && selectedPlan?.price !== null) {
      payload.price = Number(selectedPlan.price);
    }

    try {
      await axiosClient.post("/subscriptions", payload);
      setMsg({ type: "success", text: "Class subscription created successfully." });
      closeModal();
      await loadRecords();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to save class subscription." });
    } finally {
      setSaving(false);
    }
  };

  const setRecordOnHold = async (id) => {
    setMsg(null);
    setBusyId(id);
    try {
      const res = await axiosClient.post(`/subscriptions/${id}/hold`);
      setMsg({ type: "success", text: res?.data?.message || "Class subscription placed on hold." });
      await loadRecords();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to change class subscription status." });
    } finally {
      setBusyId(null);
    }
  };

  const resumeRecord = async (id) => {
    setMsg(null);
    setBusyId(id);
    try {
      const res = await axiosClient.post(`/subscriptions/${id}/resume`);
      setMsg({ type: "success", text: res?.data?.message || "Class subscription resumed." });
      await loadRecords();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to resume class subscription." });
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const sortedRecords = useMemo(() => {
    const list = [...records];
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
  }, [records]);

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Class Subscription Management</h4>
          <div className="admin-muted">Track members enrolled in the class plan and manage hold/resume status.</div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-info" onClick={() => nav("/admin/subscriptions")}>
            <i className="bi bi-credit-card-2-front me-2"></i> Subscription Page
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <i className="bi bi-plus-circle me-2"></i> Add New Subscription
          </button>
          <button className="btn btn-outline-light" onClick={loadRecords} disabled={loading}>
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
              <th>ID</th>
              <th>Member</th>
              <th>Member Phone</th>
              <th>Plan</th>
              <th>Price</th>
              <th>Duration</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center text-muted py-4">{loading ? "Loading..." : "No class subscriptions found."}</td>
              </tr>
            ) : (
              sortedRecords.map((r) => {
                const rawStatus = String(r?.status || "");
                const isOnHold = !!r?.is_on_hold;
                const isExpired = rawStatus.toLowerCase() === "expired" || isExpiredByDate(r?.end_date);
                const status = isExpired ? "Expired" : rawStatus || "-";
                const canHold = !isExpired && !isOnHold && rawStatus.toLowerCase() === "active";
                const canResume = !isExpired && isOnHold;

                return (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.member_name || r.user_name || "-"}</td>
                  <td>{r.member_phone || r.user_phone || "-"}</td>
                  <td><span className="badge bg-primary">{r.class_plan_name || r.class_package_name || r.membership_plan_name || r.plan_name || "-"}</span></td>
                  <td>{moneyMMK(r.price)}</td>
                  <td>{formatDurationDays(r)}</td>
                  <td>{r.start_date ? String(r.start_date).split("T")[0] : "-"}</td>
                  <td>{r.end_date ? String(r.end_date).split("T")[0] : "-"}</td>
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
                    {!['active', 'on hold', 'expired'].includes(status.toLowerCase()) && (
                      <span className="badge bg-info text-dark">{status || '-'}</span>
                    )}
                  </td>
                  <td>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm btn-warning"
                        disabled={!canHold || busyId === r.id}
                        onClick={() => setRecordOnHold(r.id)}
                        title="Place class subscription on hold"
                      >
                        {busyId === r.id ? "..." : "Hold"}
                      </button>
                      <button
                        className="btn btn-sm btn-success"
                        disabled={!canResume || busyId === r.id}
                        onClick={() => resumeRecord(r.id)}
                        title="Resume class subscription"
                      >
                        {busyId === r.id ? "..." : "Resume"}
                      </button>
                    </div>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content bg-dark text-white">
                <div className="modal-header">
                  <h5 className="modal-title fw-bolder">Create Class Subscription</h5>
                  <button className="btn-close btn-close-white" onClick={closeModal} aria-label="Close"></button>
                </div>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label fw-bold">Member</label>
                      <select className="form-select bg-dark text-white" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                        <option value="">Select member</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>{m.name} {m.phone ? `- ${m.phone}` : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-bold">Plan</label>
                      <select className="form-select bg-dark text-white" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                        <option value="">Select plan</option>
                        {plans.map((p) => {
                          const id = planIdOf(p);
                          return (
                            <option key={String(id)} value={String(id || "")}>{planNameOf(p) || "Class"}</option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-bold">Start Date</label>
                      <input type="date" className="form-control bg-dark text-white" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                  </div>

                  {selectedPlan && (
                    <div className="mt-3 p-3 rounded bg-dark border border-secondary-subtle">
                      <div className="fw-bold">{selectedPlan.name || selectedPlan.plan_name || "Class"}</div>
                      <div className="text-white-50">Duration: {formatDurationDays(selectedPlan)}</div>
                      <div className="text-white-50">Price: {moneyMMK(selectedPlan.price)}</div>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-light" onClick={closeModal}>Cancel</button>
                  <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Create"}</button>
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
