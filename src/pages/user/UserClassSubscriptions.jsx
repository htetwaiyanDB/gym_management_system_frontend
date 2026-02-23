import React, { useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function normalizeSubscriptions(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.subscriptions)) return payload.subscriptions;
  if (Array.isArray(payload.class_subscriptions)) return payload.class_subscriptions;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.data)) return payload.data.data;
  if (Array.isArray(payload.data?.subscriptions)) return payload.data.subscriptions;
  if (Array.isArray(payload.data?.class_subscriptions)) return payload.data.class_subscriptions;
  if (Array.isArray(payload.subscriptions?.data)) return payload.subscriptions.data;
  return [];
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

function fmtDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

function fmtMoney(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString();
}

async function requestWithFallback(requests) {
  let latestError = null;
  for (const run of requests) {
    try {
      return await run();
    } catch (error) {
      latestError = error;
      if (![401, 403, 404].includes(error?.response?.status)) throw error;
    }
  }
  throw latestError || new Error("Request failed.");
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
  return rawStatus || "-";
}

function normalizeClassTimetable(payload) {
  const list = Array.isArray(payload?.classes)
    ? payload.classes
    : Array.isArray(payload?.class_timetables)
      ? payload.class_timetables
      : Array.isArray(payload?.timetables)
        ? payload.timetables
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

  return list
    .map((item) => ({
      id: item?.id ?? item?.class_id ?? item?.timetable_id,
      name: item?.class_name ?? item?.name ?? item?.title,
      day: item?.day ?? item?.weekday ?? item?.class_day,
    }))
    .filter((item) => item.id !== undefined && item.id !== null);
}

const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function groupTimetableByDay(rows) {
  const grouped = Object.fromEntries(WEEK_DAYS.map((day) => [day, []]));
  for (const row of rows || []) {
    const day = String(row?.day || "").trim();
    const matchedDay = WEEK_DAYS.find((d) => d.toLowerCase() === day.toLowerCase());
    if (!matchedDay) continue;
    grouped[matchedDay].push(row?.name || "-");
  }
  return grouped;
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
      {status || "-"}
    </span>
  );
}

export default function UserClassSubscriptions({ embedded = false }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [timetableRows, setTimetableRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const subsRes = await requestWithFallback([
          () => axiosClient.get("/user/class-subscriptions"),
          () => axiosClient.get("/user/subscriptions"),
        ]);

        if (!alive) return;

        const allSubs = normalizeSubscriptions(subsRes?.data);
        const onlyClassSubs = allSubs.filter(isClassSubscription);
        setSubscriptions(onlyClassSubs);

        try {
          const timetableRes = await requestWithFallback([
            () => axiosClient.get("/class-timetable"),
            () => axiosClient.get("/classes"),
          ]);
          if (!alive) return;
          setTimetableRows(normalizeClassTimetable(timetableRes?.data));
        } catch {
          if (!alive) return;
          setTimetableRows([]);
        }
      } catch (e) {
        if (!alive) return;
        setError(e?.response?.data?.message || "Failed to load class subscriptions.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const hasNoData = useMemo(
    () => !loading && !error && subscriptions.length === 0,
    [loading, error, subscriptions.length],
  );
  const timetableByDay = useMemo(() => groupTimetableByDay(timetableRows), [timetableRows]);

  return (
    <div>
      {!embedded && <h2 style={{ marginBottom: 12 }}>Class Subscriptions</h2>}

      {loading && <p>Loading class subscriptions...</p>}
      {!loading && error && <div className="alert alert-danger">{error}</div>}
      {hasNoData && <p>No class subscription data available.</p>}

      <h3 style={{ marginBottom: 10 }}>Class Timetable</h3>
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "thin",
          marginBottom: 18,
        }}
      >
        {timetableRows.length === 0 ? (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              background: "rgba(0,0,0,0.25)",
              padding: "10px 12px",
              opacity: 0.85,
              width: "100%",
            }}
          >
            No class timetable available.
          </div>
        ) : (
          WEEK_DAYS.map((day) => (
            <div
              key={day}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                background: "rgba(0,0,0,0.25)",
                padding: "12px 14px",
                minWidth: 150,
                flex: "0 0 auto",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 14,
                  letterSpacing: 0.2,
                  marginBottom: 8,
                  color: "#f3f6fb",
                }}
              >
                {day}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {(timetableByDay[day] || []).length === 0 ? (
                  <div style={{ opacity: 0.6, fontSize: 13 }}>No class</div>
                ) : (
                  timetableByDay[day].map((name, i) => (
                    <div
                      key={`${day}-${name}-${i}`}
                      style={{
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 10,
                        padding: "6px 8px",
                        fontSize: 13,
                      }}
                    >
                      {name}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {subscriptions.length > 0 && (
        <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
          {subscriptions.map((sub, idx) => {
            const id = pick(sub, ["id", "subscription_id", "user_subscription_id"]) ?? idx;
            const planName =
              pick(sub, ["plan_name", "package_name", "name", "title", "membership_plan_name"]) ||
              pick(sub?.plan, ["name", "title"]) ||
              pick(sub?.package, ["name", "title"]) ||
              "Class Plan";
            const startDate = pick(sub, ["start_date", "starts_at", "start"]);
            const endDate = pick(sub, ["end_date", "ends_at", "end", "expire_at", "expires_at"]);
            const duration =
              pick(sub, ["duration", "duration_days", "days", "months"]) ||
              pick(sub?.plan, ["duration", "duration_days"]) ||
              pick(sub?.package, ["duration", "duration_days"]);
            const price =
              pick(sub, ["price", "amount", "total", "fee"]) ||
              pick(sub?.plan, ["price", "amount"]) ||
              pick(sub?.package, ["price", "amount"]);
            const status = resolveSubscriptionStatus(sub);

            const fields = [
              ["Duration", duration ? String(duration) : null],
              ["Price", price !== null ? fmtMoney(price) : null],
              ["Start Date", fmtDate(startDate)],
              ["End Date", fmtDate(endDate)],
            ].filter(([, value]) => value !== null);

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
                    <div className="small" style={{ opacity: 0.8 }}>
                      ID: {String(id)}
                    </div>
                  </div>
                  <StatusBadge status={status} />
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {fields.map(([label, value]) => (
                    <div key={label} className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>{label}</span>
                      <b style={{ textAlign: "right" }}>{value}</b>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
