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

function normalizeClassRows(payload) {
  const list = Array.isArray(payload?.classes)
    ? payload.classes
    : Array.isArray(payload?.class_timetables)
      ? payload.class_timetables
      : Array.isArray(payload?.timetables)
        ? payload.timetables
        : Array.isArray(payload?.class_subscriptions)
          ? payload.class_subscriptions
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload)
              ? payload
              : [];

  return list
    .map((item, idx) => ({
      id: item?.id ?? item?.class_id ?? item?.timetable_id ?? idx,
      className:
        item?.class_name ??
        item?.name ??
        item?.title ??
        item?.class?.name ??
        item?.class_subscription_name ??
        "Class",
      day: item?.day ?? item?.weekday ?? item?.class_day ?? "-",
      startTime: item?.start_time ?? item?.time ?? item?.starts_at ?? null,
      endTime: item?.end_time ?? item?.ends_at ?? null,
    }))
    .filter((row) => row.className || row.day || row.startTime || row.endTime);
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
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

function fmtTime(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
  return s;
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

function timetableFromSubscriptions(subscriptions) {
  const rows = [];

  subscriptions.forEach((sub, idx) => {
    const nestedRows =
      sub?.classes ||
      sub?.class_timetables ||
      sub?.timetables ||
      sub?.schedule ||
      sub?.class_schedule ||
      [];

    if (!Array.isArray(nestedRows)) return;

    nestedRows.forEach((row, rowIdx) => {
      rows.push({
        id: row?.id ?? `${idx}-${rowIdx}`,
        className:
          row?.class_name ?? row?.name ?? row?.title ?? pick(sub, ["plan_name", "package_name"]) ?? "Class",
        day: row?.day ?? row?.weekday ?? row?.class_day ?? "-",
        startTime: row?.start_time ?? row?.time ?? row?.starts_at ?? null,
        endTime: row?.end_time ?? row?.ends_at ?? null,
      });
    });
  });

  return rows;
}

export default function UserClassSubscriptions({ embedded = false }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [classRows, setClassRows] = useState([]);
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

        const fallbackRowsFromSubs = timetableFromSubscriptions(onlyClassSubs);

        try {
          const classesRes = await requestWithFallback([
            () => axiosClient.get("/user/class-timetable"),
            () => axiosClient.get("/user/class-timetables"),
            () => axiosClient.get("/user/classes"),
            () => axiosClient.get("/class-timetables"),
          ]);

          if (!alive) return;

          const normalizedRows = normalizeClassRows(classesRes?.data);
          setClassRows(normalizedRows.length ? normalizedRows : fallbackRowsFromSubs);
        } catch {
          if (!alive) return;
          setClassRows(fallbackRowsFromSubs);
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
    () => !loading && !error && subscriptions.length === 0 && classRows.length === 0,
    [loading, error, subscriptions.length, classRows.length],
  );

  return (
    <div>
      {!embedded && <h2 style={{ marginBottom: 12 }}>Class Subscriptions</h2>}

      {loading && <p>Loading class subscriptions...</p>}
      {!loading && error && <div className="alert alert-danger">{error}</div>}
      {hasNoData && <p>No class subscription data available.</p>}

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
                <div style={{ fontWeight: 800 }}>{planName}</div>
                <div className="small" style={{ opacity: 0.8 }}>
                  Subscription ID: {String(id)}
                </div>
                <div className="mt-2 d-flex justify-content-between">
                  <span style={{ opacity: 0.8 }}>Start Date</span>
                  <b>{fmtDate(startDate)}</b>
                </div>
                <div className="d-flex justify-content-between">
                  <span style={{ opacity: 0.8 }}>End Date</span>
                  <b>{fmtDate(endDate)}</b>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h3 style={{ marginBottom: 10 }}>Class Timetable</h3>
      {classRows.length === 0 ? (
        !loading && <p>No class timetable available.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {classRows.map((row) => (
            <div
              key={row.id}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                background: "rgba(0,0,0,0.25)",
                padding: "10px 12px",
              }}
            >
              <div style={{ fontWeight: 700 }}>{row.className}</div>
              <div style={{ opacity: 0.85 }}>
                {row.day}
                {(fmtTime(row.startTime) || fmtTime(row.endTime)) && (
                  <span>
                    {" "}
                    • {fmtTime(row.startTime) || "—"}
                    {fmtTime(row.endTime) ? ` - ${fmtTime(row.endTime)}` : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
