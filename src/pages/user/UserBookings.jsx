import React, { useCallback, useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";
import { FaCalendar, FaClock, FaPhoneAlt, FaUser } from "react-icons/fa";

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

function isMonthlyPackageType(value) {
  const s = String(value || "").toLowerCase();
  return s.includes("month");
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

/* ------------ page ------------ */

export default function UserBookings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [date, setDate] = useState("");
  const [filter, setFilter] = useState("all");

  const getPricingDetails = useCallback((booking) => {
    const totalPrice = pick(booking, [
      "total_price",
      "price",
      "amount",
      "package_price",
      "original_price",
      "subscription_price",
    ]);
    const discountPercent = pick(booking, [
      "discount_percent",
      "discount_percentage",
      "discount",
      "offer_percent",
    ]);
    const finalPrice = pick(booking, [
      "final_price",
      "net_price",
      "payable_amount",
      "paid_amount",
      "total_amount",
    ]);

    return { totalPrice, discountPercent, finalPrice };
  }, []);

  const normalizeStatusFilter = useCallback((statusValue) => {
    const s = String(statusValue || "").toLowerCase();
    if (s.includes("pending")) return "pending";
    if (s.includes("active")) return "active";
    if (s.includes("hold")) return "on-hold";
    if (s.includes("complete") || s.includes("done")) return "complete";
    return s;
  }, []);

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
    return items.filter((b) => {
      const s = resolveBookingStatus(b);
      const sessionDateTime =
        pick(b, ["session_datetime", "session_time", "datetime", "date_time", "start_time", "starts_at"]) ||
        pick(b, ["booking_date", "date"]);

      const dateMatch = !date || String(sessionDateTime || "").slice(0, 10) === date;
      const statusMatch =
        filter === "all" || normalizeStatusFilter(s) === filter;
      return dateMatch && statusMatch;
    });
  }, [items, date, filter, normalizeStatusFilter]);

  const cardStyle = {
    borderRadius: 14,
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: 14,
    color: "#fff",
    backdropFilter: "blur(6px)",
  };

  const pill = (bg) => ({
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: bg,
    border: "1px solid rgba(255,255,255,0.15)",
  });

  const statusPill = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("cancel")) return pill("rgba(220,53,69,0.35)");
    if (s.includes("complete") || s.includes("active")) return pill("rgba(25,135,84,0.35)");
    if (s.includes("pending")) return pill("rgba(255,193,7,0.35)");
    return pill("rgba(13,110,253,0.35)");
  };

  return (
    <div className="container py-3" style={{ maxWidth: 720 }}>
      <div style={cardStyle} className="mb-3">
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Trainer Bookings</div>
            <div className="small" style={{ opacity: 0.9 }}>
              From subscriptions
            </div>
          </div>

          <button
            className="btn btn-sm btn-outline-light"
            onClick={fetchBookings}
            disabled={loading}
            style={{ borderRadius: 10 }}
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 d-flex gap-2 flex-wrap">
          <input
            type="date"
            className="form-control"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              borderRadius: 12,
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
              width: 150,
            }}
          />

          <select
            className="form-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              borderRadius: 12,
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
              width: 160,
            }}
          >
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="on-hold">On-hold</option>
            <option value="complete">Complete</option>
          </select>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {error && (
        <div className="alert alert-danger" style={{ fontWeight: 600 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={cardStyle}>Loading bookings...</div>
      ) : filtered.length === 0 ? (
        <div style={cardStyle}>No bookings found.</div>
      ) : (
        <div className="d-flex flex-column gap-2">
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

          const isMonthlyPackage = isMonthlyPackageType(packageType);

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
          const paidStatus = pick(b, ["paid_status", "payment_status"]);
          const { totalPrice, discountPercent, finalPrice } = getPricingDetails(b);

          return (
            <div
              key={id}
              style={{ ...cardStyle, cursor: "pointer" }}
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
                  </div>

                  <span style={statusPill(status)}>{String(status || "—").toUpperCase()}</span>
                </div>

                <div className="mt-2 d-flex gap-2 flex-wrap">
                  <span style={pill("rgba(255,255,255,0.12)")}>
                    <FaCalendar /> {sessionDateTime ? String(sessionDateTime).slice(0, 10) : "—"}
                  </span>
                  <span style={pill("rgba(255,255,255,0.12)")}>
                    <FaClock /> {sessionDateTime ? fmtDateTime(sessionDateTime).split(", ")[1] || "—" : "—"}
                  </span>
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
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center gap-2">
                        <FaUser />
                        <span style={{ fontWeight: 700 }}>{toText(trainerName)}</span>
                      </div>
                      {paidStatus ? (
                        <span style={pill("rgba(25,135,84,0.35)")}>{String(paidStatus).toUpperCase()}</span>
                      ) : null}
                    </div>

                    <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Phone</span>
                      <span className="d-flex align-items-center gap-2">
                        <FaPhoneAlt />
                        {toText(trainerPhone)}
                      </span>
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

                  <div
                    style={{
                      marginTop: 6,
                      background: "linear-gradient(120deg, rgba(13,110,253,0.18), rgba(102,16,242,0.18))",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Pricing</div>
                    <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Total price</span>
                      <b>{toText(totalPrice)}</b>
                    </div>
                    <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Discount %</span>
                      <b>{toText(discountPercent)}</b>
                    </div>
                    <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Final price</span>
                      <b>{toText(finalPrice)}</b>
                    </div>
                  </div>

                  
                    {!isMonthlyPackage && (
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
                    )}

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
      )}
    </div>
  );
}
