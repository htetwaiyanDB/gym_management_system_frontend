import React, { useCallback, useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";

/* ------------ helpers ------------ */

function normalizeBookings(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.bookings)) return payload.bookings;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.data)) return payload.data.data;
  if (Array.isArray(payload.data?.bookings)) return payload.data.bookings;
  if (Array.isArray(payload.bookings?.data)) return payload.bookings.data;
  return [];
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

function resolveBookingStatus(booking) {
  const rawStatus = String(pick(booking, ["status", "state"]) || "").toLowerCase();
  const startDate = pick(booking, ["start_date", "starts_at", "start_time", "date"]);
  if (rawStatus === "pending" && hasStarted(startDate)) {
    return "active";
  }
  return rawStatus || "—";
}

function toText(v) {
  // ✅ Convert objects safely to readable text (prevents React crash)
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);

  // If API returns object like {id, name, phone, email}
  if (typeof v === "object") {
    const name =
      v?.name || v?.full_name || v?.title || v?.email || v?.phone || null;
    if (name) return String(name);

    // fallback: try to stringify without crashing
    try {
      return JSON.stringify(v);
    } catch {
      return "[object]";
    }
  }

  return String(v);
}

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return toText(v);
  return d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function isCompletedStatus(value) {
  const s = String(value || "").toLowerCase();
  return s.includes("complete") || s.includes("completed") || s.includes("done");
}


function getSessionProgress(booking) {
  const total = toNumber(pick(booking, ["sessions_count", "session_count", "sessions"]));
  const remaining = toNumber(
    pick(booking, ["sessions_remaining", "remaining_sessions", "sessions_left"])
  );
  const used = toNumber(pick(booking, ["sessions_used", "sessions_completed", "used_sessions"]));

  if (total === null) return { total: null, remaining: null };

  if (remaining !== null) return { total, remaining: Math.max(0, remaining) };
  if (used !== null) return { total, remaining: Math.max(0, total - used) };

  if (isCompletedStatus(pick(booking, ["status", "state"])) && total !== null) {
    return { total, remaining: 0 };
  }


  return { total, remaining: total };
}


function titleize(s) {
  return String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function StatusBadge({ status }) {
  const s = String(status || "").toLowerCase();

  const cls =
    s === "approved" || s === "confirmed" || s === "active"
      ? "bg-success"
      : s === "pending"
      ? "bg-warning text-dark"
      : s === "rejected"
      ? "bg-danger"
      : s === "cancelled" || s === "canceled"
      ? "bg-secondary"
      : s === "completed" || s === "done"
      ? "bg-info"
      : "bg-secondary";

  return (
    <span className={`badge ${cls}`} style={{ textTransform: "capitalize" }}>
      {status || "—"}
    </span>
  );
}

/* ------------ page ------------ */

export default function UserBookings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // Optional filter like TrainerBookings
  const [filter, setFilter] = useState("all");

  const fetchBookings = useCallback(async () => {
    setMsg(null);
    setLoading(true);
    setError("");

    try {
      const res = await axiosClient.get("/user/bookings");
      console.log("GET /user/bookings RESPONSE:", res?.data);

      const list = normalizeBookings(res?.data);

      const sorted = [...list].sort((a, b) => {
        const da = new Date(
          pick(a, ["created_at", "booking_date", "date", "start_time", "starts_at"]) || 0
        ).getTime();
        const db = new Date(
          pick(b, ["created_at", "booking_date", "date", "start_time", "starts_at"]) || 0
        ).getTime();
        return db - da;
      });

      setItems(sorted);
    } catch (e) {
      console.log("GET /user/bookings ERROR:", e?.response?.data || e);
      setError(e?.response?.data?.message || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const confirmSession = async (bookingId, event) => {
    if (!bookingId) return;
    event?.stopPropagation?.();
    setMsg(null);
    setBusyKey(`confirm-${bookingId}`);
    try {
      let res;
      try {
        res = await axiosClient.post(`/user/bookings/${bookingId}/confirm`);
      } catch (innerError) {
        if (innerError?.response?.status !== 404) {
          throw innerError;
        }
        res = await axiosClient.post(`/user/subscriptions/${bookingId}/confirm`);
      }
      setMsg({ type: "success", text: res?.data?.message || "Session confirmed." });
      await fetchBookings();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to confirm session.",
      });
    } finally {
      setBusyKey(null);
    }
  };


  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((b) => {
      const s = resolveBookingStatus(b);
      return s === filter;
    });
  }, [items, filter]);

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between" style={{ gap: 12 }}>
        <h2 style={{ marginBottom: 12 }}>Bookings</h2>

        <select
          className="form-select form-select-sm"
          style={{ width: 170 }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="confirmed">Confirmed</option>
          <option value="active">Active</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {loading && <p>Loading bookings...</p>}

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {!loading && error && (
        <div className="alert alert-danger" style={{ fontWeight: 600 }}>
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && <p>No bookings available.</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {filtered.map((b, idx) => {
          const id = pick(b, ["id", "booking_id", "reference_id"]) ?? idx;
          const status = resolveBookingStatus(b);

          // Trainer might be object: {id,name,phone,email}
          const trainerObj = pick(b, ["trainer"]) || b?.trainer;
          const trainerName =
            pick(b, ["trainer_name"]) ||
            (typeof trainerObj === "object" ? (trainerObj?.name || trainerObj?.email || trainerObj?.phone) : trainerObj) ||
            pick(b?.trainer_detail, ["name"]) ||
            "—";

            const trainerPhone =
            pick(b, ["trainer_phone"]) ||
            (typeof trainerObj === "object" ? trainerObj?.phone : null) ||
            pick(b?.trainer_detail, ["phone"]) ||
            "—";

          const service =
            pick(b, ["service", "service_name", "type", "category", "package_name"]) ||
            pick(b?.service, ["name", "title"]) ||
            pick(b?.package, ["name", "title"]) ||
            "—";

          const packageType =
            pick(b, ["package_type", "package_type_name", "package_category", "package_kind"]) ||
            pick(b?.package, ["type", "package_type", "package_kind", "package_category"]) ||
            pick(b?.trainer_package, ["type", "package_type", "package_kind", "package_category"]) ||
            pick(b?.package_detail, ["type", "package_type", "package_kind", "package_category"]) ||
            "—";


          const sessionDateTime =
            pick(b, [
              "session_datetime",
              "session_time",
              "datetime",
              "date_time",
              "start_time",
              "starts_at",
            ]) || pick(b, ["booking_date", "date"]);
          const sessionsCount = pick(b, ["sessions_count", "session_count", "sessions"]);
          const { total: totalSessions, remaining: remainingSessions } = getSessionProgress(b);
          const isCompleted =
            (totalSessions !== null && remainingSessions === 0) ||
            isCompletedStatus(pick(b, ["status", "state"]));

          const note = pick(b, ["note", "remark", "message", "description"]);

          return (
            <div
              key={id}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                background: "rgba(255,255,255,0.06)",
                padding: 14,
                 cursor: "pointer",
              }}
              onClick={() => setSelectedId((prev) => (prev === id ? null : id))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setSelectedId((prev) => (prev === id ? null : id));
                }
              }}
            >
              <div className="d-flex justify-content-between align-items-start" style={{ gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {titleize(toText(service))}
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                    Booking ID: {toText(id)}
                  </div>
                  <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
                    Trainer: {toText(trainerName)}
                  </div>
                  <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
                    Session: {sessionDateTime ? fmtDateTime(sessionDateTime) : "—"}
                  </div>
                </div>

                <StatusBadge status={toText(status)} />
              </div>

                {selectedId === id && (
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 8,
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 12,
                    padding: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                    <span style={{ opacity: 0.8 }}>Trainer</span>
                    <b style={{ textAlign: "right" }}>{toText(trainerName)}</b>
                  </div>
               
                  <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                     <span style={{ opacity: 0.8 }}>Phone</span>
                    <b style={{ textAlign: "right" }}>{toText(trainerPhone)}</b>
                  </div>

                  <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                    <span style={{ opacity: 0.8 }}>Package type</span>
                    <b style={{ textAlign: "right" }}>{toText(packageType)}</b>
                  </div>

                
                  <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                     <span style={{ opacity: 0.8 }}>Sessions Count</span>
                      <b style={{ textAlign: "right" }}>
                      {totalSessions === null
                        ? toText(sessionsCount)
                        : `${remainingSessions ?? "—"} / ${totalSessions}`}
                    </b>
                  </div>
           

              
                  <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                     <span style={{ opacity: 0.8 }}>Status</span>
                    <b style={{ textAlign: "right" }}>{toText(status)}</b>
                  </div>

                  
                  <div className="d-flex justify-content-between align-items-center" style={{ gap: 12 }}>
                    <span style={{ opacity: 0.8 }}>Session confirmation</span>
                    <button
                      className="btn btn-sm btn-outline-info"
                     onClick={(event) => confirmSession(id, event)}
                      disabled={isCompleted || busyKey === `confirm-${id}`}
                      title={isCompleted ? "All sessions completed" : "Confirm this session"}
                    >
                      {busyKey === `confirm-${id}` ? "..." : "Confirm"}
                    </button>
                  </div>
             

                {note ? (
                    <div style={{ marginTop: 6, opacity: 0.92, lineHeight: 1.6 }}>
                      <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 4 }}>
                        Note
                      </div>
                      <div>{toText(note)}</div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
