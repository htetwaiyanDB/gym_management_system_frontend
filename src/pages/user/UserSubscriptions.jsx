import React, { useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";

function normalizeSubscriptions(payload) {
  if (!payload) return [];

  // Most common
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.subscriptions)) return payload.subscriptions;
  if (Array.isArray(payload.data)) return payload.data;

  // Laravel paginator
  if (Array.isArray(payload.data?.data)) return payload.data.data;

  // Nested
  if (Array.isArray(payload.data?.subscriptions)) return payload.data.subscriptions;
  if (Array.isArray(payload.subscriptions?.data)) return payload.subscriptions.data;

  return [];
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

function fmtMoney(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString();
}

function titleize(s) {
  return String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function hasStarted(value) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return d.getTime() <= now.getTime();
}

function resolveSubscriptionStatus(sub) {
  const rawStatus = String(pick(sub, ["status", "state"]) || "").toLowerCase();
  const startDate = pick(sub, ["start_date", "starts_at", "start"]);
  if (rawStatus === "pending" && hasStarted(startDate)) {
    return "active";
  }
  return rawStatus || "—";
}

function StatusBadge({ status }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s === "active"
      ? "bg-success"
      : s === "expired" || s === "inactive"
      ? "bg-secondary"
      : s === "pending"
      ? "bg-warning text-dark"
      : "bg-info";
  return (
    <span className={`badge ${cls}`} style={{ textTransform: "capitalize" }}>
      {status || "—"}
    </span>
  );
}

export default function UserSubscriptions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await axiosClient.get("/user/subscriptions");

        // ✅ debug: see real API response structure
        console.log("GET /user/subscriptions RESPONSE:", res?.data);

        const list = normalizeSubscriptions(res?.data);

        // Sort: active first, then latest start date
        const sorted = [...list].sort((a, b) => {
          const sa = resolveSubscriptionStatus(a);
          const sb = resolveSubscriptionStatus(b);
          const rank = (s) => (s === "active" ? 0 : s === "pending" ? 1 : 2);
          const ra = rank(sa);
          const rb = rank(sb);
          if (ra !== rb) return ra - rb;

          const da = new Date(pick(a, ["start_date", "starts_at", "created_at"]) || 0).getTime();
          const db = new Date(pick(b, ["start_date", "starts_at", "created_at"]) || 0).getTime();
          return db - da;
        });

        if (alive) setItems(sorted);
      } catch (e) {
        console.log("GET /user/subscriptions ERROR:", e?.response?.data || e);
        if (alive) setError(e?.response?.data?.message || "Failed to load subscriptions.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const emptyText = useMemo(() => {
    if (loading) return "";
    if (error) return "";
    return "No subscriptions available.";
  }, [loading, error]);

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>Subscriptions</h2>

      {loading && <p>Loading subscriptions...</p>}

      {!loading && error && (
        <div className="alert alert-danger" style={{ fontWeight: 600 }}>
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && <p>{emptyText}</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((sub, idx) => {
          const id = pick(sub, ["id", "subscription_id", "user_subscription_id"]) ?? idx;

          // Plan/package info
          const planName =
            pick(sub, ["plan_name", "package_name", "name", "title"]) ||
            pick(sub?.plan, ["name", "title"]) ||
            pick(sub?.package, ["name", "title"]) ||
            "Subscription";

          const status = resolveSubscriptionStatus(sub);

          const price =
            pick(sub, ["price", "amount", "total", "fee"]) ||
            pick(sub?.plan, ["price", "amount"]) ||
            pick(sub?.package, ["price", "amount"]);

          const duration =
            pick(sub, ["duration", "duration_days", "days", "months"]) ||
            pick(sub?.plan, ["duration", "duration_days"]) ||
            pick(sub?.package, ["duration", "duration_days"]);

          const startDate = pick(sub, ["start_date", "starts_at", "start"]);
          const endDate = pick(sub, ["end_date", "ends_at", "end", "expire_at", "expires_at"]);

          const paymentMethod = pick(sub, ["payment_method", "pay_method"]);
          const paymentStatus = pick(sub, ["payment_status", "paid_status"]);
          const invoiceNo = pick(sub, ["invoice_no", "invoice_number", "receipt_no"]);

          // Anything else (show as extra fields)
          const extra = [
            ["Duration", duration ? `${duration}` : null],
            ["Price", price !== null ? fmtMoney(price) : null],
            ["Start Date", startDate ? fmtDate(startDate) : null],
            ["End Date", endDate ? fmtDate(endDate) : null],
            ["Payment Method", paymentMethod ? titleize(paymentMethod) : null],
            ["Payment Status", paymentStatus ? titleize(paymentStatus) : null],
            ["Invoice No", invoiceNo || null],
          ].filter((x) => x[1]);

          return (
            <div
              key={id}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                background: "rgba(255,255,255,0.06)",
                padding: 14,
              }}
            >
              <div className="d-flex justify-content-between align-items-start" style={{ gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{planName}</div>
                  <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                    ID: {String(id)}
                  </div>
                </div>

                <StatusBadge status={status} />
              </div>

              {extra.length > 0 && (
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {extra.map(([label, value]) => (
                    <div key={label} className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>{label}</span>
                      <b style={{ textAlign: "right" }}>{value}</b>
                    </div>
                  ))}
                </div>
              )}

              {/* Raw debug (optional): uncomment if you want see everything
              <pre style={{ marginTop: 12, fontSize: 11, opacity: 0.7, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(sub, null, 2)}
              </pre>
              */}
            </div>
          );
        })}
      </div>
    </div>
  );
}
