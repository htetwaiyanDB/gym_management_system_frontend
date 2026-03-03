import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  return isClassPlanName(plan?.name || plan?.plan_name || plan?.title);
}

function isClassSubscription(record) {
  return isClassPlanName(
    record?.membership_plan_name ||
      record?.plan_name ||
      record?.class_plan_name ||
      record?.class_package_name,
  );
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

function memberIdOf(member) {
  return member?.id ?? member?.user_id ?? member?.member_id ?? null;
}

function promptExtendPayload() {
  const nextEndDateInput = window.prompt(
    "Enter new end date (YYYY-MM-DD).\nLeave blank to extend by days instead.",
    "",
  );

  if (nextEndDateInput === null) return null;

  const nextEndDate = nextEndDateInput.trim();
  if (nextEndDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextEndDate)) {
      return { error: "Invalid date format. Please use YYYY-MM-DD." };
    }
    return { payload: { new_end_date: nextEndDate } };
  }

  const extensionDaysInput = window.prompt("Enter extension days (example: 7)", "");
  if (extensionDaysInput === null) return null;
  const extensionDays = Number(extensionDaysInput.trim());

  if (!Number.isInteger(extensionDays) || extensionDays <= 0) {
    return { error: "Extension days must be a positive whole number." };
  }

  return { payload: { extension_days: extensionDays } };
}


function formatUserCode(value) {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim();
  if (!text) return "";
  return text.padStart(5, "0");
}

function memberSearchText(member) {
  const id = memberIdOf(member);
  const pieces = [
    member?.name,
    member?.phone,
    member?.email,
    member?.user_id,
    member?.member_id,
    id,
    formatUserCode(id),
  ];
  return pieces
    .filter((piece) => piece !== null && piece !== undefined)
    .map((piece) => String(piece).toLowerCase())
    .join(" ");
}

function memberDisplayLabel(member) {
  const phone = String(member?.phone || "").trim();
  return `${member?.name || "Unknown"} (${phone || "-"})`;
}

function subscriptionSearchText(record) {
  const memberId =
    record?.member_id ?? record?.user_id ?? record?.member?.id ?? record?.user?.id ?? record?.id ?? "";
  const pieces = [
    record?.member_name,
    record?.user_name,
    record?.member_phone,
    record?.user_phone,
    memberId,
    formatUserCode(memberId),
  ];

  return pieces
    .filter((piece) => piece !== null && piece !== undefined)
    .map((piece) => String(piece).toLowerCase())
    .join(" ");
}

export default function AdminSubscriptions() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [holdAllBusy, setHoldAllBusy] = useState(false);
  const [resumeAllBusy, setResumeAllBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const [subs, setSubs] = useState([]);
  const [tableSearch, setTableSearch] = useState("");

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [plans, setPlans] = useState([]);

  const [memberId, setMemberId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(""); // optional
  const [discountPercentage, setDiscountPercentage] = useState("");

  const resetForm = () => {
    setMemberId("");
    setMemberSearch("");
    setPlanId("");
    setStartDate("");
    setDiscountPercentage("");
  };

  const load = async () => {
    setMsg(null);
    setLoading(true);
    try {
      const res = await axiosClient.get("/subscriptions");
      const allSubscriptions = normalizeSubscriptions(res.data);
      setSubs(allSubscriptions.filter((record) => !isClassSubscription(record)));
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
      const allPlans = Array.isArray(res.data?.plans) ? res.data.plans : [];
      setPlans(allPlans.filter((plan) => !isClassPlan(plan)));
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
      setMsg({ type: "danger", text: "Please choose a member from search results." });
      return;
    }
    if (!planId) {
      setMsg({ type: "danger", text: "Please select a plan." });
      return;
    }

    const hasDiscount = discountPercentage !== "" && discountPercentage !== null && discountPercentage !== undefined;
    const normalizedDiscount = hasDiscount ? Number(discountPercentage) : null;
    if (hasDiscount && (Number.isNaN(normalizedDiscount) || normalizedDiscount < 0 || normalizedDiscount > 100)) {
      setMsg({ type: "danger", text: "Discount percentage must be between 0 and 100." });
      return;
    }

    try {
      const payload = {
        member_id: Number(memberId),
        membership_plan_id: Number(planId),
        discount_percentage: normalizedDiscount,
        final_price: calculatedFinalPrice,
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

  const extendSubscription = async (id) => {
    const extendConfig = promptExtendPayload();
    if (!extendConfig) return;
    if (extendConfig.error) {
      setMsg({ type: "danger", text: extendConfig.error });
      return;
    }

    setMsg(null);
    setBusyId(id);
    try {
      const res = await axiosClient.patch(`/subscriptions/${id}/extend`, extendConfig.payload);
      setMsg({ type: "success", text: res?.data?.message || "Subscription end date extended." });
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to extend subscription end date.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const holdAllSubscriptions = async () => {
    setMsg(null);
    setHoldAllBusy(true);
    try {
      const res = await axiosClient.post("/subscription/all-hold");
      setMsg({ type: "success", text: res?.data?.message || "All active subscriptions are now on hold." });
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to hold all subscriptions.",
      });
    } finally {
      setHoldAllBusy(false);
    }
  };

  const resumeAllSubscriptions = async () => {
    setMsg(null);
    setResumeAllBusy(true);
    try {
      const res = await axiosClient.post("/subscription/all-resume");
      setMsg({ type: "success", text: res?.data?.message || "All on-hold subscriptions are resumed." });
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to resume all subscriptions.",
      });
    } finally {
      setResumeAllBusy(false);
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

  const normalizedDiscountPercentage = useMemo(() => {
    if (discountPercentage === "" || discountPercentage === null || discountPercentage === undefined) {
      return 0;
    }
    const value = Number(discountPercentage);
    if (Number.isNaN(value)) return 0;
    return Math.min(100, Math.max(0, value));
  }, [discountPercentage]);

  const selectedPlanPrice = useMemo(() => {
    if (!selectedPlan) return 0;
    const price = Number(selectedPlan?.price);
    if (Number.isNaN(price)) return 0;
    return price;
  }, [selectedPlan]);

  const calculatedFinalPrice = useMemo(() => {
    const discountAmount = selectedPlanPrice * (normalizedDiscountPercentage / 100);
    return Math.max(0, Math.round(selectedPlanPrice - discountAmount));
  }, [selectedPlanPrice, normalizedDiscountPercentage]);

  const filteredMembers = useMemo(() => {
    const keyword = memberSearch.trim().toLowerCase();
    if (!keyword) return members;
    return members.filter((member) => memberSearchText(member).includes(keyword));
  }, [members, memberSearch]);

  const selectedMember = useMemo(() => {
    if (!memberId) return null;
    return members.find((member) => String(memberIdOf(member)) === String(memberId)) || null;
  }, [members, memberId]);

  const showNoMembersWarning = Boolean(memberSearch.trim()) && filteredMembers.length === 0 && !selectedMember;

  const visibleMemberSuggestions = useMemo(() => filteredMembers.slice(0, 8), [filteredMembers]);

  const selectMember = (member) => {
    const id = memberIdOf(member);
    if (id === null || id === undefined || id === "") return;
    setMemberId(String(id));
    setMemberSearch(memberDisplayLabel(member));
  };

  const onMemberSearchChange = (value) => {
    setMemberSearch(value);

    if (!value.trim()) {
      setMemberId("");
      return;
    }

    const normalized = value.trim().toLowerCase();
    const exactMatch = members.find((member) => memberDisplayLabel(member).toLowerCase() === normalized);
    if (exactMatch) {
      const id = memberIdOf(exactMatch);
      setMemberId(id === null || id === undefined ? "" : String(id));
      return;
    }

    if (selectedMember && !memberSearchText(selectedMember).includes(normalized)) {
      setMemberId("");
    }
  };

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

  const filteredSubscriptions = useMemo(() => {
    const keyword = tableSearch.trim().toLowerCase();
    if (!keyword) return sortedSubscriptions;
    return sortedSubscriptions.filter((record) => subscriptionSearchText(record).includes(keyword));
  }, [sortedSubscriptions, tableSearch]);

  const hasOnHoldSubscriptions = useMemo(
    () => subs.some((record) => !!record?.is_on_hold && !isExpiredByDate(record?.end_date)),
    [subs],
  );

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Subscription Management</h4>
          <div className="admin-muted">
            Track members active, hold  and resume when they return.
          </div>
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-info" onClick={() => nav("/admin/subscriptions/classes")}>
            <i className="bi bi-collection-play me-2"></i> Class Page
          </button>

          <button
            className="btn btn-sm btn-warning"
            onClick={holdAllSubscriptions}
            disabled={loading || holdAllBusy || resumeAllBusy}
          >
            <i className="bi bi-pause-circle me-2"></i>
            {holdAllBusy ? "Holding..." : "Hold All"}
          </button>

          <button
            className="btn btn-sm btn-success"
            onClick={resumeAllSubscriptions}
            disabled={loading || holdAllBusy || resumeAllBusy || !hasOnHoldSubscriptions}
          >
            <i className="bi bi-play-circle me-2"></i>
            {resumeAllBusy ? "Resuming..." : "Resume All"}
          </button>

          <button className="btn btn-sm btn-primary" onClick={openCreateModal} disabled={loading || holdAllBusy || resumeAllBusy}>
            <i className="bi bi-plus-circle me-2"></i> Add Memberships
          </button>

          <button className="btn btn-sm btn-outline-light" onClick={load} disabled={loading || holdAllBusy || resumeAllBusy}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="mb-3" style={{ maxWidth: "520px" }}>
        <input
          type="text"
          className="form-control bg-dark text-white border-secondary"
          placeholder="Search by member name / ID / phone"
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
        />
      </div>

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
              <th>Discount</th>
              <th>Final Price</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th style={{ width: 140 }}>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredSubscriptions.length === 0 ? (
              <tr>
                <td colSpan="12" className="text-center text-muted py-4">
                  {loading ? "Loading..." : tableSearch.trim() ? "No subscriptions matched your search." : "No subscriptions found."}
                </td>
              </tr>
            ) : (
              filteredSubscriptions.map((s, index) => {
                const rawStatus = String(s?.status || "");
                const isOnHold = !!s?.is_on_hold;
                const isExpired = rawStatus.toLowerCase() === "expired" || isExpiredByDate(s?.end_date);
                const status = isExpired ? "Expired" : isOnHold ? "On Hold" : rawStatus || "-";
                const canHold = !isExpired && !isOnHold && rawStatus.toLowerCase() === "active";
                const canResume = !isExpired && isOnHold;
                const canExtend = isExpired;

                return (
                  <tr key={s.id}>
                    <td>{index + 1}</td>
                    <td>{s.member_name || "-"}</td>
                    <td>{s.member_phone || "-"}</td>
                    <td>
                      <span className="badge bg-primary">{s.plan_name || "-"}</span>
                    </td>
                    <td>{s.duration_days ? `${s.duration_days} day(s)` : "-"}</td>
                    <td>{moneyMMK(s.price)}</td>
                    <td>{s.discount_percentage !== null && s.discount_percentage !== undefined && s.discount_percentage !== "" ? `${s.discount_percentage}%` : "-"}</td>
                    <td>{moneyMMK(s.final_price ?? s.price)}</td>
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

                        <button
                          className="btn btn-sm btn-info"
                          disabled={!canExtend || busyId === s.id}
                          onClick={() => extendSubscription(s.id)}
                          title="Extend expired subscription end date"
                        >
                          {busyId === s.id ? "..." : "Extend"}
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
                  <h5 className="modal-title fw-bolder">Add Memberships</h5>
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
      <input
        type="text"
        className="form-control bg-dark text-white mb-2"
        placeholder="Search member by name / phone / email"
        value={memberSearch}
        onChange={(e) => onMemberSearchChange(e.target.value)}
        disabled={optionsLoading}
      />
      {!!memberSearch.trim() && visibleMemberSuggestions.length > 0 && (
        <div className="list-group mb-2" style={{ maxHeight: 220, overflowY: "auto" }}>
          {visibleMemberSuggestions.map((m) => {
            const id = memberIdOf(m);
            const isSelected = String(id) === String(memberId);
            return (
              <button
                key={id}
                type="button"
                className={`list-group-item list-group-item-action ${isSelected ? "active" : "bg-dark text-white border-secondary"}`}
                onClick={() => selectMember(m)}
                disabled={optionsLoading}
              >
                {memberDisplayLabel(m)}
              </button>
            );
          })}
        </div>
      )}
      {showNoMembersWarning && (
        <div className="form-text text-warning">No members matched your search.</div>
      )}
       {selectedMember && (
        <div className="form-text text-success">Selected: {memberDisplayLabel(selectedMember)}</div>
      )}      
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

    <div className="col-md-4">
      <label className="form-label fw-bold">Discount Percentage (%)</label>
      <input
        type="number"
        className="form-control bg-dark text-white"
        min="0"
        max="100"
        step="0.01"
        value={discountPercentage}
        onChange={(e) => setDiscountPercentage(e.target.value)}
        placeholder="Optional"
        disabled={optionsLoading}
      />
      <div className="form-text text-white-50">Enter a value between 0 and 100.</div>
    </div>
  </div>

  {/* Plan summary */}
  {selectedPlan && (
    <div className="mt-3 p-3 rounded bg-dark border border-secondary-subtle">
      <div className="fw-bold">{selectedPlan.name}</div>
      <div className="text-white-50">
        Duration: {selectedPlan.duration_days} day(s)
      </div>
      <div className="text-white-50">
        Price: {moneyMMK(selectedPlan.price)}
      </div>

      <div className="alert alert-success mt-2 mb-0 py-2 px-3">
        <span className="fw-semibold">Final Price: {moneyMMK(calculatedFinalPrice)}</span>
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
