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

function normalizePackageList(data) {
  const list = data?.packages ?? data?.class_packages ?? data?.data ?? data ?? [];
  return Array.isArray(list) ? list : [];
}

function packageIdOf(pkg) {
  return pkg?.id ?? pkg?.package_id ?? pkg?.packageId;
}

function packagePriceOf(pkg) {
  return pkg?.price ?? pkg?.price_per_session ?? pkg?.amount ?? null;
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
  const [classPackages, setClassPackages] = useState([]);
  const [classPrice, setClassPrice] = useState(null);

  const [memberId, setMemberId] = useState("");
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(""); // optional
  // Removed classId since we only have one fixed class package

  const resetForm = () => {
    setMemberId("");
    setPlanId("");
    setStartDate("");
    // No need to reset classId since it's removed
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

    // load options + class packages + class pricing
    setOptionsLoading(true);
    try {
      const [optionsResult, pricingResult] = await Promise.allSettled([
        axiosClient.get("/subscriptions/options"),
        axiosClient.get("/pricing"),
      ]);

      if (optionsResult.status !== "fulfilled") {
        throw optionsResult.reason;
      }

      setMembers(Array.isArray(optionsResult.value.data?.members) ? optionsResult.value.data.members : []);
      setPlans(Array.isArray(optionsResult.value.data?.plans) ? optionsResult.value.data.plans : []);

      if (pricingResult.status === "fulfilled") {
        const pricing = pricingResult.value?.data?.subscription_prices || {};
        setClassPrice(
          pricing.class_subscription_price ??
            pricing.class_price ??
            pricing.class_month ??
            pricing.class ??
            null
        );
      } else {
        setClassPrice(null);
      }

      try {
        const classRes = await axiosClient.get("/class-packages");
        setClassPackages(normalizePackageList(classRes.data));
      } catch (error) {
        if (error?.response?.status !== 404) throw error;
        setClassPackages([]);
      }
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

    // No need to check for class selection since we have only one fixed class package

    try {
      const payload = {};
      
      if (String(planId).startsWith("class-")) {
        const selectedClassPackageId = Number(String(planId).replace("class-", ""));

        if (!classMembershipPlanId) {
          setMsg({ type: "danger", text: "Class membership plan is not configured yet." });
          return;
        }

        payload.member_id = Number(memberId);
        payload.membership_plan_id = classMembershipPlanId;
        payload.subscription_type = "class";
        payload.type = "class";
        payload.plan_type = "class";
        if (startDate) payload.start_date = startDate;

        if (!Number.isNaN(selectedClassPackageId) && selectedClassPackageId > 0) {
          payload.class_id = selectedClassPackageId;
          payload.class_package_id = selectedClassPackageId;
        }
      } else {
        // Handle regular subscription
        payload.member_id = Number(memberId);
        payload.membership_plan_id = Number(planId);
        if (startDate) payload.start_date = startDate;
      }

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
    if (String(planId).startsWith("class-")) {
      const selectedClassPackageId = Number(String(planId).replace("class-", ""));
      const selectedClassPackage = classPackages.find(
        (pkg) => Number(packageIdOf(pkg)) === selectedClassPackageId
      );
      return { 
        id: planId,
        name:
          selectedClassPackage?.name ||
          selectedClassPackage?.title ||
          "Class",
        type: "class", 
        plan_type: "class",
        duration_days:
          selectedClassPackage?.duration_days ??
          (selectedClassPackage?.duration_months
            ? Number(selectedClassPackage.duration_months) * 30
            : 30),
        price: packagePriceOf(selectedClassPackage) ?? classPrice,
      };
    }
    return planMap.get(String(planId)) || null;
  }, [planId, planMap, classPackages, classPrice]);

  const classMembershipPlanId = useMemo(() => {
    const classPlan = plans.find((plan) => {
      const name = String(plan?.name || "").toLowerCase();
      return name === "class" || name.includes("class");
    });
    return classPlan?.id ? Number(classPlan.id) : "";
  }, [plans]);

  // Removed requiresClassSelection since we don't need class selection

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

    
    <div className="col-md-6">
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
        {classPackages.map((pkg) => {
          const pkgId = packageIdOf(pkg);
          if (pkgId === null || pkgId === undefined) return null;
          const duration = pkg?.duration_months
            ? `${pkg.duration_months} Month${Number(pkg.duration_months) === 1 ? "" : "s"}`
            : "Class";
          const price = packagePriceOf(pkg) ?? classPrice;
          return (
            <option key={`class-${pkgId}`} value={`class-${pkgId}`}>
              {pkg?.name || pkg?.title || `Class #${pkgId}`} ({duration}
              {price !== null && price !== undefined ? ` - ${moneyMMK(price)}` : ""})
            </option>
          );
        })}
      </select>
    </div>

    {/* Start Date */}
    <div className="col-md-6">
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
    <div className="mt-3 p-3 rounded bg-dark border border-secondary-subtle">
      <div className="fw-bold">{selectedPlan.name}</div>
      <div className="text-white-50">
        Duration: {selectedPlan.duration_days || "-"} day(s)
      </div>
      <div className="text-white-50">
        Price: {moneyMMK(selectedPlan.price)}
      </div>
      {String(planId).startsWith("class-") && (
        <div className="text-success-emphasis">Class pricing is synced from Pricing page package values.</div>
      )}
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
