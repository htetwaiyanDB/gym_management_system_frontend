import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axiosClient, { clearRequestCache } from "../../api/axiosClient";

function moneyMMK(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${n.toLocaleString("en-US")} MMK`;
}

function normalizeMembershipPlanList(data) {
  const list = data?.plans ?? data?.membership_plans ?? data?.data ?? data ?? [];
  return Array.isArray(list) ? list : [];
}

function legacyPricingToPlans(data) {
  const prices = data?.subscription_prices || {};
  return [
    { id: "legacy-oneMonth", name: "One Month Plan", duration_days: 30, price: prices.one_month, plan_type: "membership", is_active: true, legacy_type: "oneMonth" },
    { id: "legacy-threeMonths", name: "Three Months Plan", duration_days: 90, price: prices.three_months, plan_type: "membership", is_active: true, legacy_type: "threeMonths" },
    { id: "legacy-sixMonths", name: "Six Months Plan", duration_days: 180, price: prices.six_months, plan_type: "membership", is_active: true, legacy_type: "sixMonths" },
    { id: "legacy-twelveMonths", name: "Twelve Months Plan", duration_days: 360, price: prices.twelve_months, plan_type: "membership", is_active: true, legacy_type: "twelveMonths" },
    { id: "legacy-classPrice", name: "Class Plan", duration_days: 30, price: prices.class_subscription_price ?? prices.class_price ?? prices.class, plan_type: "class", is_active: true, legacy_type: "classPrice" },
  ].filter((plan) => plan.price !== null && plan.price !== undefined && plan.price !== "");
}

function isBuiltInMembershipPlan(plan) {
  if (plan?.is_system === true || plan?.is_default === true) return true;
  const name = String(plan?.name || "")
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  return new Set([
    "1 month",
    "1 month plan",
    "one month",
    "one month plan",
    "3 months",
    "3 months plan",
    "three months",
    "three months plan",
    "6 months",
    "6 months plan",
    "six months",
    "six months plan",
    "12 months",
    "12 months plan",
    "twelve months",
    "twelve months plan",
    "class",
    "class plan",
  ]).has(name);
}

function membershipPlanIdOf(plan) {
  return plan?.id ?? plan?.membership_plan_id ?? plan?.plan_id;
}

function membershipPlanToInput(plan = {}) {
  return {
    name: plan?.name ?? "",
    duration_days: plan?.duration_days ?? "",
    price: plan?.price ?? "",
    plan_type: plan?.plan_type ?? plan?.type ?? "membership",
    is_active: plan?.is_active !== false && Number(plan?.is_active) !== 0,
    legacy_type: plan?.legacy_type ?? null,
  };
}

function emptyMembershipPlanForm() {
  return {
    name: "",
    duration_days: "",
    price: "",
    plan_type: "membership",
    is_active: true,
  };
}

const PACKAGE_TYPES = {
  trainer: {
    key: "trainer",
    title: "Trainer Packages",
    emptyText: "No trainer packages found.",
    endpoint: "/trainer-packages",
  },
  boxing: {
    key: "boxing",
    title: "Boxing Packages",
    emptyText: "No boxing packages found.",
    endpoint: "/boxing-packages",
  },
};

function normalizePackageList(data) {
  const list = data?.packages ?? data?.trainer_packages ?? data?.boxing_packages ?? data?.data ?? data ?? [];
  return Array.isArray(list) ? list : [];
}

function packageIdOf(pkg) {
  return pkg?.id ?? pkg?.package_id ?? pkg?.packageId;
}

function packageToInput(pkg = {}) {
  return {
    name: pkg?.name ?? "",
    package_type: pkg?.package_type ?? pkg?.type ?? "",
    sessions_count: pkg?.sessions_count ?? pkg?.sessions ?? "",
    duration_months: pkg?.duration_months ?? pkg?.duration ?? "",
    price: pkg?.price ?? pkg?.price_per_session ?? "",
  };
}

function emptyCreateForm() {
  return {
    name: "",
    package_type: "",
    sessions_count: "",
    duration_months: "",
    price: "",
  };
}

export default function AdminPricing() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const [membershipPlans, setMembershipPlans] = useState([]);
  const [membershipPlanInputs, setMembershipPlanInputs] = useState({});
  const [createMembershipPlanInput, setCreateMembershipPlanInput] = useState(emptyMembershipPlanForm);
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [membershipCrudAvailable, setMembershipCrudAvailable] = useState(true);
  const [pendingDeletePlan, setPendingDeletePlan] = useState(null);
  const cancelDeleteButtonRef = useRef(null);

  const [activePackageTab, setActivePackageTab] = useState(PACKAGE_TYPES.trainer.key);
  const [trainerPackages, setTrainerPackages] = useState([]);
  const [boxingPackages, setBoxingPackages] = useState([]);
  const [packageInputs, setPackageInputs] = useState({});
  const [createPackageInputs, setCreatePackageInputs] = useState({
    [PACKAGE_TYPES.trainer.key]: emptyCreateForm(),
    [PACKAGE_TYPES.boxing.key]: emptyCreateForm(),
  });

  const [busyKey, setBusyKey] = useState(null);

  const normalizeNumberInput = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isNaN(n) ? NaN : n;
  };

  const load = async () => {
    setMsg(null);
    setLoading(true);

    try {
      const [membershipPlansResult, legacyPricingResult, trainerResult, boxingResult] = await Promise.allSettled([
        axiosClient.get("/membership-plans", { cache: false }),
        axiosClient.get("/pricing", { cache: false }),
        axiosClient.get(PACKAGE_TYPES.trainer.endpoint, { cache: false }),
        axiosClient.get(PACKAGE_TYPES.boxing.endpoint, { cache: false }),
      ]);

      const legacyPlanList = legacyPricingResult.status === "fulfilled"
        ? legacyPricingToPlans(legacyPricingResult.value.data)
        : [];
      let membershipPlanList = [];
      setMembershipCrudAvailable(membershipPlansResult.status === "fulfilled");
      if (membershipPlansResult.status === "fulfilled") {
        const endpointPlans = normalizeMembershipPlanList(membershipPlansResult.value.data);
        const customPlans = endpointPlans.filter((plan) => !isBuiltInMembershipPlan(plan));
        membershipPlanList = legacyPlanList.length > 0
          ? [...legacyPlanList, ...customPlans]
          : endpointPlans;
      } else if (legacyPricingResult.status === "fulfilled") {
        membershipPlanList = legacyPlanList;
        setMsg({
          type: "warning",
          text: "Membership CRUD endpoint is unavailable. Showing the existing pricing data instead.",
        });
      }
      setMembershipPlans(membershipPlanList);

      const nextMembershipPlanInputs = {};
      membershipPlanList.forEach((plan) => {
        const id = membershipPlanIdOf(plan);
        if (id === null || id === undefined) return;
        nextMembershipPlanInputs[id] = membershipPlanToInput(plan);
      });
      setMembershipPlanInputs(nextMembershipPlanInputs);

      const trainerList = trainerResult.status === "fulfilled"
        ? normalizePackageList(trainerResult.value.data)
        : [];
      const boxingList = boxingResult.status === "fulfilled"
        ? normalizePackageList(boxingResult.value.data)
        : [];

      setTrainerPackages(trainerList);
      setBoxingPackages(boxingList);

      const nextInputs = {};
      trainerList.forEach((pkg) => {
        const id = packageIdOf(pkg);
        if (id === null || id === undefined) return;
        nextInputs[`${PACKAGE_TYPES.trainer.key}-${id}`] = packageToInput(pkg);
      });
      boxingList.forEach((pkg) => {
        const id = packageIdOf(pkg);
        if (id === null || id === undefined) return;
        nextInputs[`${PACKAGE_TYPES.boxing.key}-${id}`] = packageToInput(pkg);
      });

      setPackageInputs(nextInputs);

      if (membershipPlanList.length === 0 && trainerList.length === 0 && boxingList.length === 0) {
        const failedResult = [membershipPlansResult, legacyPricingResult, trainerResult, boxingResult]
          .find((result) => result.status === "rejected");
        throw failedResult?.reason || new Error("Failed to load pricing.");
      }
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to load pricing.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!pendingDeletePlan) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busyKey?.startsWith("delete-membership-plan-")) {
        setPendingDeletePlan(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => cancelDeleteButtonRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [pendingDeletePlan, busyKey]);

  const validateMembershipPlan = (current) => {
    const name = String(current?.name || "").trim();
    const durationDays = normalizeNumberInput(current?.duration_days);
    const price = normalizeNumberInput(current?.price);
    const planType = String(current?.plan_type || "").trim().toLowerCase();

    if (!name) return { error: "Plan name is required." };
    if (durationDays === null || Number.isNaN(durationDays) || !Number.isInteger(durationDays) || durationDays < 1) {
      return { error: "Duration must be a whole number of at least 1 day." };
    }
    if (price === null || Number.isNaN(price) || price < 0) {
      return { error: "Please enter a valid plan price." };
    }
    if (!["membership", "class"].includes(planType)) {
      return { error: "Please select a valid plan type." };
    }

    return {
      payload: {
        name,
        duration_days: durationDays,
        price,
        plan_type: planType,
        is_active: Boolean(current?.is_active),
      },
    };
  };

  const createMembershipPlan = async () => {
    setMsg(null);
    const validated = validateMembershipPlan(createMembershipPlanInput);
    if (validated.error) {
      setMsg({ type: "danger", text: validated.error });
      return;
    }

    setBusyKey("create-membership-plan");
    try {
      const res = await axiosClient.post("/membership-plans", validated.payload);
      setMsg({ type: "success", text: res?.data?.message || "Membership plan created." });
      setCreateMembershipPlanInput(emptyMembershipPlanForm());
      setShowAddPlanModal(false);
      clearRequestCache();
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to create membership plan.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const updateMembershipPlan = async (planId) => {
    setMsg(null);
    const current = membershipPlanInputs[planId];
    if (!current) return;

    const validated = validateMembershipPlan(current);
    if (validated.error) {
      setMsg({ type: "danger", text: validated.error });
      return;
    }

    setBusyKey(`update-membership-plan-${planId}`);
    try {
      let res;
      if (current.legacy_type === "oneMonth") {
        res = await axiosClient.put("/pricing/one-month", {
          one_month_subscription_price: validated.payload.price,
        });
      } else if (current.legacy_type === "threeMonths") {
        res = await axiosClient.put("/pricing/three-months", {
          three_month_subscription_price: validated.payload.price,
        });
      } else if (current.legacy_type === "sixMonths") {
        res = await axiosClient.put("/pricing/six-months", {
          six_month_subscription_price: validated.payload.price,
        });
      } else if (current.legacy_type === "twelveMonths") {
        res = await axiosClient.put("/pricing/twelve-months", {
          twelve_month_subscription_price: validated.payload.price,
        });
      } else if (current.legacy_type === "classPrice") {
        res = await axiosClient.put("/pricing/class", {
          class_subscription_price: validated.payload.price,
        });
      } else {
        res = await axiosClient.put(`/membership-plans/${planId}`, validated.payload);
      }
      setMsg({ type: "success", text: res?.data?.message || "Membership plan updated." });
      clearRequestCache();
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to update membership plan.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const deleteMembershipPlan = async (plan) => {
    const planId = membershipPlanIdOf(plan);
    if (planId === null || planId === undefined) return;

    setMsg(null);
    setBusyKey(`delete-membership-plan-${planId}`);
    try {
      const res = await axiosClient.delete(`/membership-plans/${planId}`);
      setMsg({ type: "success", text: res?.data?.message || "Membership plan deleted." });
      setPendingDeletePlan(null);
      clearRequestCache();
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to delete membership plan.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const validatePackagePayload = (current) => {
    const price = normalizeNumberInput(current.price);
    if (price === null || Number.isNaN(price) || price < 0) {
      return { error: "Please enter a valid package price." };
    }

    const sessionsCount = normalizeNumberInput(current.sessions_count);
    if (sessionsCount !== null && Number.isNaN(sessionsCount)) {
      return { error: "Sessions count must be a valid number." };
    }

    const durationMonths = normalizeNumberInput(current.duration_months);
    if (durationMonths !== null && Number.isNaN(durationMonths)) {
      return { error: "Duration months must be a valid number." };
    }

    return {
      payload: {
        name: current.name?.trim() || null,
        package_type: current.package_type?.trim() || null,
        sessions_count: sessionsCount,
        duration_months: durationMonths,
        price,
      },
    };
  };

  const updatePackage = async (packageType, packageId) => {
    setMsg(null);

    const current = packageInputs[`${packageType}-${packageId}`];
    if (!current) return;

    const validated = validatePackagePayload(current);
    if (validated.error) {
      setMsg({ type: "danger", text: validated.error });
      return;
    }

    setBusyKey(`update-${packageType}-${packageId}`);
    try {
      const endpoint = PACKAGE_TYPES[packageType].endpoint;
      const res = await axiosClient.put(`${endpoint}/${packageId}`, validated.payload);

      setMsg({ type: "success", text: res?.data?.message || "Package updated." });
      clearRequestCache();
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to update package.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const createPackage = async (packageType) => {
    setMsg(null);

    const current = createPackageInputs[packageType] || emptyCreateForm();
    const validated = validatePackagePayload(current);
    if (validated.error) {
      setMsg({ type: "danger", text: validated.error });
      return;
    }

    setBusyKey(`create-${packageType}`);
    try {
      const endpoint = PACKAGE_TYPES[packageType].endpoint;
      const res = await axiosClient.post(endpoint, validated.payload);
      setMsg({ type: "success", text: res?.data?.message || "Package created." });
      setCreatePackageInputs((prev) => ({
        ...prev,
        [packageType]: emptyCreateForm(),
      }));

      clearRequestCache();
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to create package.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const deletePackage = async (packageType, packageId) => {
    setMsg(null);

    setBusyKey(`delete-${packageType}-${packageId}`);
    try {
      const endpoint = PACKAGE_TYPES[packageType].endpoint;
      const res = await axiosClient.delete(`${endpoint}/${packageId}`);
      setMsg({ type: "success", text: res?.data?.message || "Package deleted." });

      clearRequestCache();
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to delete package.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const currentPackages = useMemo(
    () => (activePackageTab === PACKAGE_TYPES.trainer.key ? trainerPackages : boxingPackages),
    [activePackageTab, trainerPackages, boxingPackages]
  );

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Pricing</h4>
          <div className="admin-muted">Update subscription prices (including class plan), trainer packages, and boxing packages.</div>
        </div>

        <div className="d-flex gap-2">
          <button
            className="btn btn-success"
            onClick={() => setShowAddPlanModal(true)}
            disabled={!membershipCrudAvailable}
            title={!membershipCrudAvailable ? "Membership CRUD API is not available on the connected backend." : undefined}
          >
            <i className="bi bi-plus-circle me-2"></i>
            Add Plan
          </button>
          <button className="btn btn-outline-light" onClick={load} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type}`} role="status" aria-live="polite">
          {msg.text}
        </div>
      )}

      <div className="row g-3 mb-4">
        {membershipPlans.length === 0 ? (
          <div className="col-12 text-center text-muted py-4">
            {loading ? "Loading pricing..." : "No pricing plans found."}
          </div>
        ) : (
          membershipPlans.map((plan) => {
            const id = membershipPlanIdOf(plan);
            const input = membershipPlanInputs[id] || membershipPlanToInput(plan);
            const updateKey = `update-membership-plan-${id}`;
            const deleteKey = `delete-membership-plan-${id}`;

            return (
              <div className="col-12 col-md-6 col-xl-3" key={id ?? plan?.name}>
                <div className="card bg-dark text-light h-100 border-secondary">
                  <div className="card-header border-secondary fw-semibold">{plan?.name || "Pricing Plan"}</div>
                  <div className="card-body">
                    <div className="admin-muted">Current {String(plan?.name || "plan").toLowerCase()} price</div>
                    <div className="fs-5 fw-bold mb-3">{moneyMMK(plan?.price)}</div>

                    <div className="input-group mb-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="form-control"
                        aria-label={`New price for ${plan?.name || "pricing plan"}`}
                        value={input.price ?? ""}
                        onChange={(e) => setMembershipPlanInputs((prev) => ({
                          ...prev,
                          [id]: { ...prev[id], price: e.target.value },
                        }))}
                        placeholder="Enter new price"
                      />
                      <span className="input-group-text">MMK</span>
                    </div>

                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-primary flex-grow-1"
                        disabled={busyKey === updateKey || id === undefined || id === null}
                        onClick={() => updateMembershipPlan(id)}
                      >
                        {busyKey === updateKey ? "Updating..." : "Update"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        disabled={Boolean(plan?.legacy_type) || busyKey === deleteKey || id === undefined || id === null}
                        onClick={() => setPendingDeletePlan(plan)}
                        title={plan?.legacy_type ? "Delete requires the membership CRUD API." : undefined}
                      >
                        {busyKey === deleteKey ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showAddPlanModal && createPortal(
        <>
          <div className="modal d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="add-pricing-title">
            <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content bg-dark text-light border-secondary">
                <div className="modal-header border-secondary">
                  <h5 className="modal-title" id="add-pricing-title">Add Pricing Plan</h5>
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    aria-label="Close"
                    onClick={() => setShowAddPlanModal(false)}
                    disabled={busyKey === "create-membership-plan"}
                  ></button>
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label" htmlFor="new-plan-name">Plan Name</label>
                    <input
                      id="new-plan-name"
                      className="form-control"
                      value={createMembershipPlanInput.name}
                      onChange={(e) => setCreateMembershipPlanInput((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. 2 Months Plan"
                      maxLength={255}
                    />
                  </div>
                  <div className="row g-3">
                    <div className="col-12 col-sm-6">
                      <label className="form-label" htmlFor="new-plan-type">Plan Type</label>
                      <select
                        id="new-plan-type"
                        className="form-select"
                        value={createMembershipPlanInput.plan_type}
                        onChange={(e) => setCreateMembershipPlanInput((prev) => ({ ...prev, plan_type: e.target.value }))}
                      >
                        <option value="membership">Membership</option>
                        <option value="class">Class</option>
                      </select>
                    </div>
                    <div className="col-12 col-sm-6">
                      <label className="form-label" htmlFor="new-plan-duration">Duration (Days)</label>
                      <input
                        id="new-plan-duration"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        className="form-control"
                        value={createMembershipPlanInput.duration_days}
                        onChange={(e) => setCreateMembershipPlanInput((prev) => ({ ...prev, duration_days: e.target.value }))}
                        placeholder="e.g. 60"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="form-label" htmlFor="new-plan-price">Price</label>
                    <div className="input-group">
                      <input
                        id="new-plan-price"
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="form-control"
                        value={createMembershipPlanInput.price}
                        onChange={(e) => setCreateMembershipPlanInput((prev) => ({ ...prev, price: e.target.value }))}
                        placeholder="e.g. 220000"
                      />
                      <span className="input-group-text">MMK</span>
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-secondary">
                  <button
                    type="button"
                    className="btn btn-outline-light"
                    onClick={() => setShowAddPlanModal(false)}
                    disabled={busyKey === "create-membership-plan"}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={createMembershipPlan}
                    disabled={busyKey === "create-membership-plan"}
                  >
                    {busyKey === "create-membership-plan" ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show"></div>
        </>,
        document.body
      )}

      {pendingDeletePlan && createPortal(
        <>
          <div
            className="modal d-block"
            tabIndex="-1"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-pricing-title"
            aria-describedby="delete-pricing-description"
          >
            <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 460 }}>
              <div className="modal-content bg-dark text-light border border-secondary shadow-lg">
                <div className="modal-header border-secondary">
                  <div className="d-flex align-items-center gap-2">
                    <span
                      className="d-inline-flex align-items-center justify-content-center rounded-circle bg-danger bg-opacity-25 text-danger"
                      style={{ width: 40, height: 40 }}
                      aria-hidden="true"
                    >
                      <i className="bi bi-trash3-fill"></i>
                    </span>
                    <div>
                      <h5 className="modal-title mb-0" id="delete-pricing-title">Delete pricing plan?</h5>
                      <div className="small text-secondary">This action needs confirmation.</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    aria-label="Close delete confirmation"
                    onClick={() => setPendingDeletePlan(null)}
                    disabled={busyKey === `delete-membership-plan-${membershipPlanIdOf(pendingDeletePlan)}`}
                  ></button>
                </div>
                <div className="modal-body" id="delete-pricing-description">
                  <p className="mb-3">
                    Are you sure you want to delete <strong className="text-white">{pendingDeletePlan?.name || "this plan"}</strong>?
                  </p>
                  <div className="border border-secondary rounded p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div className="d-flex align-items-start gap-2 small" style={{ color: "#e2e8f0" }}>
                      <i className="bi bi-info-circle-fill text-warning mt-1" aria-hidden="true"></i>
                      <span><strong className="text-white">Important:</strong> It will no longer be available when creating new memberships.</span>
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-secondary gap-2">
                  <button
                    ref={cancelDeleteButtonRef}
                    type="button"
                    className="btn btn-outline-light"
                    onClick={() => setPendingDeletePlan(null)}
                    disabled={busyKey === `delete-membership-plan-${membershipPlanIdOf(pendingDeletePlan)}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => deleteMembershipPlan(pendingDeletePlan)}
                    disabled={busyKey === `delete-membership-plan-${membershipPlanIdOf(pendingDeletePlan)}`}
                  >
                    {busyKey === `delete-membership-plan-${membershipPlanIdOf(pendingDeletePlan)}` ? (
                      <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Deleting...</>
                    ) : (
                      <><i className="bi bi-trash3 me-2" aria-hidden="true"></i>Delete Plan</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" style={{ opacity: 0.65 }}></div>
        </>,
        document.body
      )}

      <div className="card bg-dark text-light border-secondary">
        <div className="card-header border-secondary d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span className="fw-semibold">Packages Management</span>
          <div className="btn-group" role="group" aria-label="Package tabs">
            <button
              className={`btn ${activePackageTab === PACKAGE_TYPES.trainer.key ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setActivePackageTab(PACKAGE_TYPES.trainer.key)}
            >
              Trainer Packages
            </button>
            <button
              className={`btn ${activePackageTab === PACKAGE_TYPES.boxing.key ? "btn-primary" : "btn-outline-light"}`}
              onClick={() => setActivePackageTab(PACKAGE_TYPES.boxing.key)}
            >
              Boxing Packages
            </button>
          </div>
        </div>

        <div className="p-3 border-bottom border-secondary">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-2">
              <label className="form-label mb-1">Name</label>
              <input
                className="form-control"
                value={createPackageInputs[activePackageTab]?.name ?? ""}
                onChange={(e) =>
                  setCreatePackageInputs((prev) => ({
                    ...prev,
                    [activePackageTab]: {
                      ...prev[activePackageTab],
                      name: e.target.value,
                    },
                  }))
                }
                placeholder="e.g. 1 Month"
              />
            </div>
            <div className="col-12 col-md-2">
              <label className="form-label mb-1">Package Type</label>
              <input
                className="form-control"
                value={createPackageInputs[activePackageTab]?.package_type ?? ""}
                onChange={(e) =>
                  setCreatePackageInputs((prev) => ({
                    ...prev,
                    [activePackageTab]: {
                      ...prev[activePackageTab],
                      package_type: e.target.value,
                    },
                  }))
                }
                placeholder="e.g. personal"
              />
            </div>
            <div className="col-12 col-md-2">
              <label className="form-label mb-1">Sessions</label>
              <input
                className="form-control"
                value={createPackageInputs[activePackageTab]?.sessions_count ?? ""}
                onChange={(e) =>
                  setCreatePackageInputs((prev) => ({
                    ...prev,
                    [activePackageTab]: {
                      ...prev[activePackageTab],
                      sessions_count: e.target.value,
                    },
                  }))
                }
                placeholder="Optional"
              />
            </div>
            <div className="col-12 col-md-2">
              <label className="form-label mb-1">Duration (Months)</label>
              <input
                className="form-control"
                value={createPackageInputs[activePackageTab]?.duration_months ?? ""}
                onChange={(e) =>
                  setCreatePackageInputs((prev) => ({
                    ...prev,
                    [activePackageTab]: {
                      ...prev[activePackageTab],
                      duration_months: e.target.value,
                    },
                  }))
                }
                placeholder="Optional"
              />
            </div>
            <div className="col-12 col-md-2">
              <label className="form-label mb-1">Price (MMK)</label>
              <input
                className="form-control"
                value={createPackageInputs[activePackageTab]?.price ?? ""}
                onChange={(e) =>
                  setCreatePackageInputs((prev) => ({
                    ...prev,
                    [activePackageTab]: {
                      ...prev[activePackageTab],
                      price: e.target.value,
                    },
                  }))
                }
                placeholder="Required"
              />
            </div>
            <div className="col-12 col-md-2">
              <button
                className="btn btn-success w-100"
                disabled={busyKey === `create-${activePackageTab}`}
                onClick={() => createPackage(activePackageTab)}
              >
                {busyKey === `create-${activePackageTab}` ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Package Type</th>
                <th style={{ width: 160 }}>Sessions</th>
                <th style={{ width: 160 }}>Duration (Months)</th>
                <th style={{ width: 220 }}>Price (MMK)</th>
                <th style={{ width: 190 }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {currentPackages.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center text-muted py-4">
                    {loading ? "Loading..." : PACKAGE_TYPES[activePackageTab].emptyText}
                  </td>
                </tr>
              ) : (
                currentPackages.map((pkg) => {
                  const id = packageIdOf(pkg);
                  const input = packageInputs[`${activePackageTab}-${id}`] || {};
                  return (
                    <tr key={`${activePackageTab}-${id ?? pkg?.name}`}>
                      <td>
                        <input
                          className="form-control"
                          value={input.name ?? ""}
                          onChange={(e) =>
                            setPackageInputs((s) => ({
                              ...s,
                              [`${activePackageTab}-${id}`]: {
                                ...s[`${activePackageTab}-${id}`],
                                name: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="form-control"
                          value={input.package_type ?? ""}
                          onChange={(e) =>
                            setPackageInputs((s) => ({
                              ...s,
                              [`${activePackageTab}-${id}`]: {
                                ...s[`${activePackageTab}-${id}`],
                                package_type: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="form-control"
                          value={input.sessions_count ?? ""}
                          onChange={(e) =>
                            setPackageInputs((s) => ({
                              ...s,
                              [`${activePackageTab}-${id}`]: {
                                ...s[`${activePackageTab}-${id}`],
                                sessions_count: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="form-control"
                          value={input.duration_months ?? ""}
                          onChange={(e) =>
                            setPackageInputs((s) => ({
                              ...s,
                              [`${activePackageTab}-${id}`]: {
                                ...s[`${activePackageTab}-${id}`],
                                duration_months: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <div className="input-group">
                          <input
                            className="form-control"
                            value={input.price ?? ""}
                            onChange={(e) =>
                              setPackageInputs((s) => ({
                                ...s,
                                [`${activePackageTab}-${id}`]: {
                                  ...s[`${activePackageTab}-${id}`],
                                  price: e.target.value,
                                },
                              }))
                            }
                          />
                          <span className="input-group-text">MMK</span>
                        </div>
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={busyKey === `update-${activePackageTab}-${id}` || id === undefined || id === null}
                            onClick={() => updatePackage(activePackageTab, id)}
                          >
                            {busyKey === `update-${activePackageTab}-${id}` ? "Updating..." : "Update"}
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            disabled={busyKey === `delete-${activePackageTab}-${id}` || id === undefined || id === null}
                            onClick={() => deletePackage(activePackageTab, id)}
                          >
                            {busyKey === `delete-${activePackageTab}-${id}` ? "Deleting..." : "Delete"}
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
      </div>
    </div>
  );
}
