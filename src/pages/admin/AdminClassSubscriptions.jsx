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
    .toLowerCase() === "class";
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
    (Array.isArray(payload?.plans) && payload.plans) ||
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
  const [msg, setMsg] = useState(null);
  const [records, setRecords] = useState([]);
  const [members, setMembers] = useState([]);
  const [plans, setPlans] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [memberId, setMemberId] = useState("");
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState("");

  const resetForm = () => {
    setMemberId("");
    setPlanId("");
    setStartDate("");
    setEditing(null);
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
    const [optionsRes, pricingRes] = await Promise.all([
      axiosClient.get("/subscriptions/options"),
      axiosClient.get("/pricing"),
    ]);

    const { members: memberList, plans: planList } = normalizeOptions(optionsRes.data);
    const classPrice =
      pricingRes?.data?.subscription_prices?.class_subscription_price ??
      pricingRes?.data?.subscription_prices?.class_price ??
      pricingRes?.data?.subscription_prices?.class_month ??
      pricingRes?.data?.subscription_prices?.class;

    const filteredClassPlans = planList.filter((plan) => isClassPlanName(plan?.name || plan?.plan_name));

    const normalizedPlans = filteredClassPlans.length
      ? filteredClassPlans.map((plan) => ({
          ...plan,
          duration_days: pickDurationDays(plan),
        }))
      : [
          {
            id: "class-default",
            name: "Class",
            price: classPrice,
            duration_days: 30,
          },
        ];

    setMembers(memberList);
    setPlans(normalizedPlans);
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

  const openEdit = async (record) => {
    setEditing(record);
    setMemberId(String(record?.member_id || record?.user_id || ""));
    setPlanId(String(record?.class_plan_id || record?.class_package_id || record?.plan_id || ""));
    setStartDate((record?.start_date || "").split("T")[0]);
    setShowModal(true);
    try {
      await loadOptions();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to load edit options." });
    }
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const selectedPlan = useMemo(() => plans.find((p) => String(p.id) === String(planId)) || null, [plans, planId]);

  const save = async () => {
    if (!memberId) return setMsg({ type: "danger", text: "Please select a member." });
    if (!planId) return setMsg({ type: "danger", text: "Please select a class package." });

    setSaving(true);
    setMsg(null);

    const payload = {
      member_id: Number(memberId),
      membership_plan_id: Number.isNaN(Number(planId)) ? undefined : Number(planId),
      class_plan_id: Number.isNaN(Number(planId)) ? undefined : Number(planId),
      class_package_id: Number.isNaN(Number(planId)) ? undefined : Number(planId),
      plan_id: Number.isNaN(Number(planId)) ? undefined : Number(planId),
    };

    if (startDate) payload.start_date = startDate;
    if (selectedPlan?.price !== undefined && selectedPlan?.price !== null) {
      payload.price = Number(selectedPlan.price);
    }

    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

    try {
      if (editing?.id) {
        await requestWithFallback([
          () => axiosClient.put(`/subscriptions/${editing.id}`, payload),
          () => axiosClient.patch(`/subscriptions/${editing.id}`, payload),
        ]);
        setMsg({ type: "success", text: "Class subscription updated successfully." });
      } else {
        await axiosClient.post("/subscriptions", payload);
        setMsg({ type: "success", text: "Class subscription created successfully." });
      }
      closeModal();
      await loadRecords();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to save class subscription." });
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (id) => {
    if (!window.confirm("Delete this class subscription?")) return;
    setMsg(null);
    try {
      await requestWithFallback([
        () => axiosClient.delete(`/subscriptions/${id}`),
        () => axiosClient.post(`/subscriptions/${id}/cancel`),
      ]);
      setMsg({ type: "success", text: "Class subscription deleted." });
      await loadRecords();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to delete class subscription." });
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Class Subscription Management</h4>
          <div className="admin-muted">Track members enrolled in the class plan.</div>
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
              records.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.member_name || r.user_name || "-"}</td>
                  <td>{r.member_phone || r.user_phone || "-"}</td>
                  <td><span className="badge bg-primary">{r.class_plan_name || r.class_package_name || r.membership_plan_name || r.plan_name || "-"}</span></td>
                  <td>{moneyMMK(r.price)}</td>
                  <td>{formatDurationDays(r)}</td>
                  <td>{r.start_date ? String(r.start_date).split("T")[0] : "-"}</td>
                  <td>{r.end_date ? String(r.end_date).split("T")[0] : "-"}</td>
                  <td><span className="badge bg-secondary text-capitalize">{r.status || "-"}</span></td>
                  <td>
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-warning" onClick={() => openEdit(r)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteRecord(r.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
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
                  <h5 className="modal-title fw-bolder">{editing ? "Update Class Subscription" : "Create Class Subscription"}</h5>
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
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>{p.name || p.plan_name || "Class"}</option>
                        ))}
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
                  <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : editing ? "Update" : "Create"}</button>
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
