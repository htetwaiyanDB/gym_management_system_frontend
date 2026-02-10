import React, { useEffect, useMemo, useState } from "react";
import axiosClient, { clearRequestCache } from "../../api/axiosClient";

function moneyMMK(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${n.toLocaleString("en-US")} MMK`;
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

  const [prices, setPrices] = useState({
    oneMonth: "",
    threeMonths: "",
    sixMonths: "",
    twelveMonths: "",
  });

  const [inputs, setInputs] = useState({
    oneMonth: "",
    threeMonths: "",
    sixMonths: "",
    twelveMonths: "",
  });

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
      const [pricingRes, trainerRes, boxingRes] = await Promise.all([
        axiosClient.get("/pricing", { cache: false }),
        axiosClient.get(PACKAGE_TYPES.trainer.endpoint, { cache: false }),
        axiosClient.get(PACKAGE_TYPES.boxing.endpoint, { cache: false }),
      ]);
      const p = pricingRes.data?.subscription_prices || {};

      const oneMonth = p.one_month ?? "";
      const threeMonths = p.three_months ?? "";
      const sixMonths = p.six_months ?? "";
      const twelveMonths = p.twelve_months ?? "";

      setPrices({ oneMonth, threeMonths, sixMonths, twelveMonths });
      setInputs({
        oneMonth: String(oneMonth),
        threeMonths: String(threeMonths),
        sixMonths: String(sixMonths),
        twelveMonths: String(twelveMonths),
      });

      const trainerList = normalizePackageList(trainerRes.data);
      const boxingList = normalizePackageList(boxingRes.data);

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

  const updatePlan = async (type) => {
    setMsg(null);

    const value = Number(inputs[type]);
    if (Number.isNaN(value) || value < 0) {
      setMsg({ type: "danger", text: "Please enter a valid price." });
      return;
    }

    setBusyKey(type);
    try {
      if (type === "oneMonth") {
        const res = await axiosClient.put("/pricing/one-month", {
          one_month_subscription_price: value,
        });
        setMsg({ type: "success", text: res?.data?.message || "One-month price updated." });
      }

      if (type === "threeMonths") {
        const res = await axiosClient.put("/pricing/three-months", {
          three_month_subscription_price: value,
        });
        setMsg({ type: "success", text: res?.data?.message || "Three-month price updated." });
      }

      if (type === "sixMonths") {
        const res = await axiosClient.put("/pricing/six-months", {
          six_month_subscription_price: value,
        });
        setMsg({ type: "success", text: res?.data?.message || "Six-month price updated." });
      }

      if (type === "twelveMonths") {
        const res = await axiosClient.put("/pricing/twelve-months", {
          twelve_month_subscription_price: value,
        });
        setMsg({ type: "success", text: res?.data?.message || "Twelve-month price updated." });
      }

      clearRequestCache();
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to update price.",
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
          <div className="admin-muted">Update subscription prices, trainer packages, and boxing packages.</div>
        </div>

        <button className="btn btn-outline-light" onClick={load} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-2"></i>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="row g-3 mb-4">
        <div className="col-12 col-md-3">
          <div className="card bg-dark text-light h-100 border-secondary">
            <div className="card-header border-secondary fw-semibold">One Month Plan</div>
            <div className="card-body">
              <div className="admin-muted">Current one-month price</div>
              <div className="fs-5 fw-bold mb-3">{moneyMMK(prices.oneMonth)}</div>

              <div className="input-group mb-3">
                <input
                  className="form-control"
                  value={inputs.oneMonth}
                  onChange={(e) => setInputs((s) => ({ ...s, oneMonth: e.target.value }))}
                  placeholder="Enter new price"
                />
                <span className="input-group-text">MMK</span>
              </div>

              <button
                className="btn btn-primary w-100"
                disabled={busyKey === "oneMonth"}
                onClick={() => updatePlan("oneMonth")}
              >
                {busyKey === "oneMonth" ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-3">
          <div className="card bg-dark text-light h-100 border-secondary">
            <div className="card-header border-secondary fw-semibold">Three Months Plan</div>
            <div className="card-body">
              <div className="admin-muted">Current three-month price</div>
              <div className="fs-5 fw-bold mb-3">{moneyMMK(prices.threeMonths)}</div>

              <div className="input-group mb-3">
                <input
                  className="form-control"
                  value={inputs.threeMonths}
                  onChange={(e) => setInputs((s) => ({ ...s, threeMonths: e.target.value }))}
                  placeholder="Enter new price"
                />
                <span className="input-group-text">MMK</span>
              </div>

              <button
                className="btn btn-primary w-100"
                disabled={busyKey === "threeMonths"}
                onClick={() => updatePlan("threeMonths")}
              >
                {busyKey === "threeMonths" ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-3">
          <div className="card bg-dark text-light h-100 border-secondary">
            <div className="card-header border-secondary fw-semibold">Six Months Plan</div>
            <div className="card-body">
              <div className="admin-muted">Current six-month price</div>
              <div className="fs-5 fw-bold mb-3">{moneyMMK(prices.sixMonths)}</div>

              <div className="input-group mb-3">
                <input
                  className="form-control"
                  value={inputs.sixMonths}
                  onChange={(e) => setInputs((s) => ({ ...s, sixMonths: e.target.value }))}
                  placeholder="Enter new price"
                />
                <span className="input-group-text">MMK</span>
              </div>

              <button
                className="btn btn-primary w-100"
                disabled={busyKey === "sixMonths"}
                onClick={() => updatePlan("sixMonths")}
              >
                {busyKey === "sixMonths" ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-3">
          <div className="card bg-dark text-light h-100 border-secondary">
            <div className="card-header border-secondary fw-semibold">Twelve Months Plan</div>
            <div className="card-body">
              <div className="admin-muted">Current twelve-month price</div>
              <div className="fs-5 fw-bold mb-3">{moneyMMK(prices.twelveMonths)}</div>

              <div className="input-group mb-3">
                <input
                  className="form-control"
                  value={inputs.twelveMonths}
                  onChange={(e) => setInputs((s) => ({ ...s, twelveMonths: e.target.value }))}
                  placeholder="Enter new price"
                />
                <span className="input-group-text">MMK</span>
              </div>

              <button
                className="btn btn-primary w-100"
                disabled={busyKey === "twelveMonths"}
                onClick={() => updatePlan("twelveMonths")}
              >
                {busyKey === "twelveMonths" ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>
      </div>

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
