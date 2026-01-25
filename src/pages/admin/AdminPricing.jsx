import React, { useEffect, useState } from "react";
import axiosClient from "../../api/axiosClient";

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

  const [trainers, setTrainers] = useState([]);
  const [trainerInputs, setTrainerInputs] = useState({});
  const [busyKey, setBusyKey] = useState(null);

  const load = async () => {
    setMsg(null);
    setLoading(true);

    try {
      const res = await axiosClient.get("/pricing");
      const p = res.data?.subscription_prices || {};

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

      const t = Array.isArray(res.data?.trainers) ? res.data.trainers : [];
      setTrainers(t);

      const ti = {};
      t.forEach((tr) => {
        ti[tr.id] = String(tr.price_per_session ?? "");
      });
      setTrainerInputs(ti);
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
          three_months_subscription_price: value,
        });
        setMsg({ type: "success", text: res?.data?.message || "Three-month price updated." });
      }

       if (type === "sixMonths") {
        const res = await axiosClient.put("/pricing/six-months", {
          six_months_subscription_price: value,
        });
        setMsg({ type: "success", text: res?.data?.message || "Six-month price updated." });
      }

      if (type === "twelveMonths") {
        const res = await axiosClient.put("/pricing/twelve-months", {
          twelve_months_subscription_price: value,
        });
        setMsg({ type: "success", text: res?.data?.message || "Twelve-month price updated." });
      }

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

  const updateTrainer = async (trainerId) => {
    setMsg(null);

    const value = Number(trainerInputs[trainerId]);
    if (Number.isNaN(value) || value < 0) {
      setMsg({ type: "danger", text: "Please enter a valid trainer session price." });
      return;
    }

    setBusyKey(`trainer-${trainerId}`);
    try {
      const res = await axiosClient.put(`/pricing/trainers/${trainerId}`, {
        price_per_session: value,
      });

      setMsg({ type: "success", text: res?.data?.message || "Trainer price updated." });
      await load();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to update trainer price.",
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
          <div className="admin-muted">Update subscription prices and trainer session pricing.</div>
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

      {/* ===== Trainer session pricing ===== */}
      <div className="card bg-dark text-light border-secondary">
        <div className="card-header border-secondary fw-semibold">Trainer Session Pricing</div>

        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Trainer Name</th>
                <th style={{ width: 260 }}>Price per Session (MMK)</th>
                <th style={{ width: 140 }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {trainers.length === 0 ? (
                <tr>
                  <td colSpan="3" className="text-center text-muted py-4">
                    {loading ? "Loading..." : "No trainers found."}
                  </td>
                </tr>
              ) : (
                trainers.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>
                      <div className="input-group">
                        <input
                          className="form-control"
                          value={trainerInputs[t.id] ?? ""}
                          onChange={(e) =>
                            setTrainerInputs((s) => ({ ...s, [t.id]: e.target.value }))
                          }
                        />
                        <span className="input-group-text">MMK</span>
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busyKey === `trainer-${t.id}`}
                        onClick={() => updateTrainer(t.id)}
                      >
                        {busyKey === `trainer-${t.id}` ? "Updating..." : "Update"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
