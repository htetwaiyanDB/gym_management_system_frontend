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

function normalizeSubscriptionRecord(raw) {
  const planName =
    pick(raw, ["plan_name", "membership_plan_name", "package_name", "name", "title"]) ||
    pick(raw?.plan, ["name", "title", "plan_name"]) ||
    pick(raw?.package, ["name", "title", "plan_name"]) ||
    "Membership";

  const price = pickFromSources([raw, raw?.plan, raw?.package], [
    "price",
    "plan_price",
    "amount",
    "total",
    "fee",
  ]);

  const discountPercentage = pickFromSources([raw, raw?.plan, raw?.package], [
    "discount_percentage",
    "discount_percent",
    "discountPercentage",
    "discount_rate",
    "applied_discount_percentage",
  ]);

  const finalPrice = pickFromSources([raw, raw?.plan, raw?.package], [
    "final_price",
    "finalPrice",
    "final_pricing",
    "net_price",
    "payable_amount",
    "amount_after_discount",
  ]);

  return {
    ...raw,
    id: pick(raw, ["id", "subscription_id", "user_subscription_id"]),
    member_name: pick(raw, ["member_name", "user_name", "name"]),
    member_phone: pick(raw, ["member_phone", "phone"]),
    plan_name: planName,
    duration_days:
      pick(raw, ["duration_days", "duration", "days", "months"]) ||
      pick(raw?.plan, ["duration_days", "duration"]) ||
      pick(raw?.package, ["duration_days", "duration"]),
    price,
    discount_percentage: discountPercentage ?? 0,
    final_price: finalPrice ?? price,
    start_date: pick(raw, ["start_date", "starts_at", "start"]),
    end_date: pick(raw, ["end_date", "ends_at", "end", "expire_at", "expires_at"]),
    is_on_hold:
      pick(raw, ["is_on_hold", "on_hold"]) ??
      String(pick(raw, ["status", "state"]) || "").toLowerCase() === "on_hold",
    status: pick(raw, ["status", "state"]),
  };
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

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = typeof v === "string" ? v.replace(/,/g, "") : v;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function fmtPercent(v) {
  const n = toNumber(v);
  if (n === null) return null;
  if (Number.isInteger(n)) return `${n}%`;
  return `${n.toFixed(2).replace(/\.00$/, "")}%`;
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

function pickFromSources(sources, keys) {
  for (const source of sources) {
    const value = pick(source, keys);
    if (value !== null) return value;
  }
  return null;
}

function isClassSubscription(sub) {
  const name = String(
    pick(sub, ["plan_name", "package_name", "name", "title", "membership_plan_name"]) ||
      pick(sub?.plan, ["name", "title", "plan_name"]) ||
      pick(sub?.package, ["name", "title", "plan_name"]) ||
      "",
  )
    .trim()
    .toLowerCase();

  const type = String(
    pick(sub, ["type", "plan_type", "category", "package_type"]) ||
      pick(sub?.plan, ["type", "plan_type", "category", "package_type"]) ||
      pick(sub?.package, ["type", "plan_type", "category", "package_type"]) ||
      "",
  )
    .trim()
    .toLowerCase();

  return type === "class" || name.includes("class");
}

function isTruthyFlag(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === "number") return value === 1;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseDateValue(value) {
  if (!value) return null;
  const str = String(value).trim();
  const dateOnlyMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const normalized = str.includes("T") ? str : str.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFutureStartDate(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime() > today.getTime();
}

function resolveSubscriptionStatus(sub) {
  const startDate = pick(sub, ["start_date", "starts_at", "start"]);
  if (isTruthyFlag(sub?.is_pending) || isTruthyFlag(sub?.pending)) return "pending";
  if (isTruthyFlag(sub?.is_on_hold) || isTruthyFlag(sub?.on_hold)) return "on-hold";
  const rawStatus = String(pick(sub, ["status", "state"]) || "").toLowerCase();
  if (rawStatus === "active" && isFutureStartDate(startDate)) return "pending";
  return rawStatus || "—";
}

function StatusBadge({ status }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s === "active"
      ? "bg-success"
      : s === "expired" || s === "inactive"
      ? "bg-danger text-white"
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

        const list = normalizeSubscriptions(res?.data).map(normalizeSubscriptionRecord);

        // Sort: active first, then latest start date
        const normalSubscriptions = list.filter((sub) => !isClassSubscription(sub));

        const sorted = [...normalSubscriptions].sort((a, b) => {
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
        if (alive) setError(e?.response?.data?.message || "Failed to load memberships.");
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
    return "No memberships available.";
  }, [loading, error]);

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>Memberships</h2>

      {loading && <p>Loading memberships...</p>}

      {!loading && error && (
        <div className="alert alert-danger" style={{ fontWeight: 600 }}>
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && <p>{emptyText}</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((sub, idx) => {
          const id = pick(sub, ["id", "subscription_id", "user_subscription_id"]) ?? idx;
          const nestedSources = [
            sub,
            sub?.plan,
            sub?.package,
            sub?.subscription,
            sub?.user_subscription,
            sub?.membership_subscription,
          ];

          // Plan/package info
          const planName =
            pick(sub, ["plan_name", "package_name", "name", "title"]) ||
            pick(sub?.plan, ["name", "title"]) ||
            pick(sub?.package, ["name", "title"]) ||
            "Membership";

          const status = resolveSubscriptionStatus(sub);

          const price = pickFromSources(nestedSources, [
            "price",
            "amount",
            "total",
            "fee",
            "final_price",
            "finalPrice",
            "final_pricing",
            "payable_amount",
            "payableAmount",
          ]);

          const duration =
            pick(sub, ["duration", "duration_days", "days", "months"]) ||
            pick(sub?.plan, ["duration", "duration_days"]) ||
            pick(sub?.package, ["duration", "duration_days"]);

          const startDate = pick(sub, ["start_date", "starts_at", "start"]);
          const endDate = pick(sub, ["end_date", "ends_at", "end", "expire_at", "expires_at"]);

          const paymentMethod = pick(sub, ["payment_method", "pay_method"]);
          const paymentStatus = pick(sub, ["payment_status", "paid_status"]);
          const invoiceNo = pick(sub, ["invoice_no", "invoice_number", "receipt_no"]);

          const basePrice = pickFromSources(nestedSources, [
            "original_price",
            "originalPrice",
            "base_price",
            "basePrice",
            "list_price",
            "mrp",
            "plan_price",
            "price_before_discount",
            "priceBeforeDiscount",
            "price",
          ]);

          const discountPercentRaw = pickFromSources(nestedSources, [
            "discount_percent",
            "discount_percentage",
            "discountPercentage",
            "discount_rate",
            "applied_discount_percentage",
            "percentage",
          ]);

          const discountAmountRaw = pickFromSources(nestedSources, [
            "discount_amount",
            "discount",
            "discount_value",
            "applied_discount_amount",
            "discountAmount",
          ]);

          const finalPriceRaw = pickFromSources(nestedSources, [
            "final_price",
            "finalPrice",
            "final_pricing",
            "net_price",
            "payable_amount",
            "payableAmount",
            "amount_after_discount",
            "amountAfterDiscount",
          ]);

          const priceNum = toNumber(price);
          const basePriceNum = toNumber(basePrice) ?? priceNum;
          const discountAmountNum = toNumber(discountAmountRaw);
          const finalPriceNum = toNumber(finalPriceRaw);
          const discountPercentNum =
            toNumber(discountPercentRaw) ??
            (discountAmountNum !== null && basePriceNum
              ? (discountAmountNum / basePriceNum) * 100
              : finalPriceNum !== null && basePriceNum
              ? ((basePriceNum - finalPriceNum) / basePriceNum) * 100
              : null);

          const computedFinalPrice =
            finalPriceNum ??
          
            (basePriceNum !== null && discountPercentNum !== null
              ? basePriceNum * (1 - discountPercentNum / 100)
              : priceNum);

          // Anything else (show as extra fields)
          const extra = [
            ["Duration", duration ? `${duration}` : null],
            ["Original Price", basePriceNum !== null ? fmtMoney(basePriceNum) : null],
            ["Discount %", fmtPercent(discountPercentNum)],
            ["Final Price", computedFinalPrice !== null ? fmtMoney(computedFinalPrice) : fmtMoney(price)],
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

              {(discountPercentNum !== null || finalPriceNum !== null) && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginTop: '8px', 
                  paddingTop: '8px', 
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}>
                  <div style={{ flex: 1, minWidth: '100px' }}>
                    <small className="text-muted">Original Price:</small>
                    <div style={{ fontWeight: 600, textDecoration: 'line-through' }}>{fmtMoney(basePriceNum)}</div>
                  </div>
                  <div style={{ flex: '0 0 auto', minWidth: '80px' }}>
                    <small className="text-muted">Discount:</small>
                    <div style={{ fontWeight: 600, color: '#28a745' }}>{fmtPercent(discountPercentNum)} OFF</div>
                  </div>
                  <div style={{ flex: 1, minWidth: '100px' }}>
                    <small className="text-muted">Final Price:</small>
                    <div style={{ fontWeight: 700, fontSize: '1.1em', color: '#28a745' }}>{fmtMoney(computedFinalPrice)}</div>
                  </div>
                </div>
              )}

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
