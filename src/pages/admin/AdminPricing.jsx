import React, { useEffect, useState } from "react";
import axiosClient, { clearRequestCache } from "../../api/axiosClient";

function moneyMMK(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-US") + " MMK";
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

  const [trainerPackages, setTrainerPackages] = useState([]);
  const [packageInputs, setPackageInputs] = useState({});
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
      const [pricingRes, packagesRes] = await Promise.all([
        axiosClient.get("/pricing", { cache: false }),
        axiosClient.get("/trainer-packages", { cache: false }),
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

      const list =
        packagesRes.data?.packages ??
        packagesRes.data?.trainer_packages ??
        packagesRes.data?.data ??
        packagesRes.data ??
        [];
      const normalized = Array.isArray(list) ? list : [];
      setTrainerPackages(normalized);

      const nextInputs = {};
      normalized.forEach((pkg) => {
        const id = pkg?.id ?? pkg?.package_id ?? pkg?.packageId;
        if (id === null || id === undefined) return;
        nextInputs[id] = {
          name: pkg?.name ?? "",
          package_type: pkg?.package_type ?? pkg?.type ?? "",
          sessions_count: pkg?.sessions_count ?? pkg?.sessions ?? "",
          duration_months: pkg?.duration_months ?? pkg?.duration ?? "",
          price: pkg?.price ?? pkg?.price_per_session ?? "",
        };
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

  const updatePackage = async (packageId) => {
    setMsg(null);

    const current = packageInputs[packageId];
    if (!current) return;

    const price = normalizeNumberInput(current.price);
    if (price === null || Number.isNaN(price) || price < 0) {
      setMsg({ type: "danger", text: "Please enter a valid package price." });
      return;
    }

    const sessionsCount = normalizeNumberInput(current.sessions_count);
    if (sessionsCount !== null && Number.isNaN(sessionsCount)) {
      setMsg({ type: "danger", text: "Sessions count must be a valid number." });
      return;
    }

    const durationMonths = normalizeNumberInput(current.duration_months);
    if (durationMonths !== null && Number.isNaN(durationMonths)) {
      setMsg({ type: "danger", text: "Duration months must be a valid number." });
      return;
    }

    setBusyKey(`package-${packageId}`);
    try {
      const payload = {
        name: current.name?.trim() || null,
        package_type: current.package_type?.trim() || null,
        sessions_count: sessionsCount,
        duration_months: durationMonths,
        price,
      };
      const res = await axiosClient.put(`/trainer-packages/${packageId}`, payload);

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

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Pricing</h4>
           <div className="admin-muted">Update subscription prices and trainer packages.</div>
        </div>

        <button className="btn btn-outline-light" onClick={load} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-2"></i>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* ===== Subscription plan pricing ===== */}
      <div className="row g-3 mb-4">
                {/* One Month */}
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

        {/* Three Months */}
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

         {/* Six Months */}
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

        {/* Twelve Months */}
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

      {/* ===== Trainer packages pricing ===== */}
      <div className="card bg-dark text-light border-secondary">
        <div className="card-header border-secondary fw-semibold">Trainer Packages</div>

        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Package Type</th>
                <th style={{ width: 160 }}>Sessions</th>
                <th style={{ width: 160 }}>Duration (Months)</th>
                <th style={{ width: 200 }}>Price (MMK)</th>
                <th style={{ width: 140 }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {trainerPackages.length === 0 ? (
                <tr>
                   <td colSpan="6" className="text-center text-muted py-4">
                    {loading ? "Loading..." : "No trainer packages found."}
                  </td>
                </tr>
              ) : (
                                trainerPackages.map((pkg) => {
                  const id = pkg?.id ?? pkg?.package_id ?? pkg?.packageId;
                  const input = packageInputs[id] || {};
                  return (
                  <tr key={id ?? pkg?.name}>
                    <td>
                      <input
                        className="form-control"
                        value={input.name ?? ""}
                        onChange={(e) =>
                          setPackageInputs((s) => ({
                            ...s,
                            [id]: {
                              ...s[id],
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
                            [id]: {
                              ...s[id],
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
                            [id]: {
                              ...s[id],
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
                            [id]: {
                              ...s[id],
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
                              [id]: {
                                ...s[id],
                                price: e.target.value,
                              },
                            }))
                          }                         
                        />
                        <span className="input-group-text">MMK</span>
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busyKey === `package-${id}` || id === undefined || id === null}
                        onClick={() => updatePackage(id)}
                      >
                          {busyKey === `package-${id}` ? "Updating..." : "Update"}
                      </button>
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
