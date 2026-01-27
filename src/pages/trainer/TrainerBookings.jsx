import React, { useCallback, useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";
import { FaCalendar, FaClock, FaPhoneAlt, FaUser } from "react-icons/fa";

/**
 * Endpoint:
 *   GET /api/trainer/subscriptions
 *  POST /api/trainer/bookings/{booking}/confirm
 *
 * Response:
 * {
 *   "bookings": [
 *      {
 *        id,
 *        member_name | member:{name},
 *        date | start_date,
 *        time | start_time,
 *        session_datetime (common: "YYYY-MM-DD HH:mm:ss"),
 *        status,
 *        note
 *      }
 *   ]
 * }
 */

function getMemberName(b) {
  return b?.member_name || b?.member?.name || b?.user?.name || "—";
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

/** ✅ NEW: parse backend datetime safely (supports "YYYY-MM-DD HH:mm:ss" and ISO) */
function parseBackendDateTime(value) {
  if (!value) return null;
  const str = String(value);
  const normalized = str.includes("T") ? str : str.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
  const total = toNumber(
    booking?.sessions_count ?? booking?.session_count ?? booking?.sessions
  );
  const remaining = toNumber(
    booking?.sessions_remaining ?? booking?.remaining_sessions ?? booking?.sessions_left
  );
  const used = toNumber(
    booking?.sessions_used ?? booking?.sessions_completed ?? booking?.used_sessions
  );

  if (remaining !== null) {
    return { total: total ?? null, remaining: Math.max(0, remaining) };
  }

  if (total === null) return { total: null, remaining: null };
  if (used !== null) return { total, remaining: Math.max(0, total - used) };

  if (isCompletedStatus(booking?.status) && total !== null) {
    return { total, remaining: 0 };
  }

  return { total, remaining: total };
}

function getPackageType(booking) {
  return (
    pick(booking, ["package_type", "package_type_name", "package_category", "package_kind"]) ||
    pick(booking?.package, ["type", "package_type", "package_kind", "package_category"]) ||
    pick(booking?.trainer_package, ["type", "package_type", "package_kind", "package_category"]) ||
    pick(booking?.package_detail, ["type", "package_type", "package_kind", "package_category"]) ||
    "—"
  );
}


/** ✅ UPDATED: supports session_datetime + more fallbacks */
function getDate(b) {
  const dtRaw =
    b?.session_datetime ||
    b?.session_time ||
    b?.datetime ||
    b?.date_time ||
    b?.starts_at ||
    b?.start_time;

  const d = parseBackendDateTime(dtRaw);
  if (d) return formatISODate(d);

  // fallback if backend provides a pure date field
  if (b?.date) return b.date;
  if (b?.start_date) return b.start_date;

  // fallback if string contains date at beginning
  if (typeof dtRaw === "string" && dtRaw.length >= 10) return dtRaw.slice(0, 10);

  return "";
}

/** ✅ UPDATED: supports session_datetime + more fallbacks */
function getTime(b) {
  const dtRaw =
    b?.session_datetime ||
    b?.session_time ||
    b?.datetime ||
    b?.date_time ||
    b?.starts_at ||
    b?.start_time;

  const d = parseBackendDateTime(dtRaw);
  if (d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // fallback if backend provides a pure time field
  if (b?.time) return b.time;

  // fallback if string looks like time or includes time part
  if (typeof dtRaw === "string") {
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(dtRaw)) return dtRaw; // "10:30" or "10:30:00"
    const maybe = dtRaw.split(" ")[1] || dtRaw.split("T")[1]; // "YYYY-MM-DD HH:mm:ss" or ISO
    if (maybe) return maybe;
  }

  return "—";
}

export default function TrainerBooking() {
  const isMobile = useMemo(() => window.innerWidth < 768, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  

  const [bookings, setBookings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // filters
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");

 const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      // ✅ UPDATED ENDPOINT
      const res = await axiosClient.get("/trainer/subscriptions");
      setBookings(Array.isArray(res?.data?.bookings) ? res.data.bookings : []);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
 }, [fetchBookings]);

  const confirmSession = async (bookingId) => {
    if (!bookingId) return;
    setMsg(null);
    setBusyKey(`confirm-${bookingId}`);
    try {
      const res = await axiosClient.post(`/trainer/bookings/${bookingId}/confirm`);
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
    return bookings.filter((b) => {
      const nameMatch =
        !search || getMemberName(b).toLowerCase().includes(search.toLowerCase());

      const dateMatch = !date || getDate(b) === date;

      return nameMatch && dateMatch;
    });
  }, [bookings, search, date]);

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
    if (s.includes("complete")) return pill("rgba(25,135,84,0.35)");
    if (s.includes("pending")) return pill("rgba(255,193,7,0.35)");
    return pill("rgba(13,110,253,0.35)");
  };

    const paidPill = (paidStatus) => {
    const s = String(paidStatus || "").toLowerCase();
    if (s.includes("paid")) return pill("rgba(25,135,84,0.35)");
    if (s.includes("unpaid")) return pill("rgba(220,53,69,0.35)");
    return pill("rgba(255,255,255,0.12)");
  };

  if (!isMobile) {
    return (
      <div className="container py-3" style={{ maxWidth: 720 }}>
        <div className="alert alert-warning">
          Trainer booking view is optimized for mobile.
        </div>
      </div>
    );
  }

  return (
    <div className="container py-3" style={{ maxWidth: 720 }}>
      {/* Header */}
      <div style={cardStyle} className="mb-3">
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              Trainer Bookings
            </div>
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

        {/* Filters */}
        <div className="mt-3 d-flex gap-2">
          <input
            className="form-control"
            placeholder="Search member..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              borderRadius: 12,
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
            }}
          />

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
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}


      {/* List */}
      {loading ? (
        <div style={cardStyle}>Loading bookings...</div>
      ) : filtered.length === 0 ? (
        <div style={cardStyle}>No bookings found.</div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {filtered.map((b, i) => {
            const bookingId = b?.id ?? i;
            const { total: totalSessions, remaining: remainingSessions } = getSessionProgress(b);
            const isCompleted =
                remainingSessions === 0 || isCompletedStatus(b?.status);
            return (
            <div
              key={bookingId}
              style={{ ...cardStyle, cursor: "pointer" }}
              onClick={() =>
                setSelectedId((prev) => (prev === bookingId ? null : bookingId))
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setSelectedId((prev) =>
                    prev === bookingId ? null : bookingId
                  );
                }
              }}
            >
              <div className="d-flex justify-content-between">
                <div style={{ fontWeight: 900 }}>{getMemberName(b)}</div>
                <span style={statusPill(b.status)}>
                  {String(b.status || "ACTIVE").toUpperCase()}
                </span>
              </div>

              <div className="mt-2 d-flex gap-2 flex-wrap">
                <span style={pill("rgba(255,255,255,0.12)")}>
                    <FaCalendar /> {getDate(b) || "—"}
                </span>
                <span style={pill("rgba(255,255,255,0.12)")}>
                  <FaClock /> {getTime(b)}
                </span>
              </div>

                            {selectedId === bookingId && (
                <div
                  className="mt-3"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: 12,
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                      <FaUser />
                      <span style={{ fontWeight: 700 }}>
                        {getMemberName(b)}
                      </span>
                    </div>
                    <span style={paidPill(b.paid_status)}>
                      {String(b.paid_status || "—").toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-2 d-flex flex-column gap-2">
                    <div className="d-flex justify-content-between">
                      <span style={{ opacity: 0.8 }}>Phone</span>
                      <span className="d-flex align-items-center gap-2">
                        <FaPhoneAlt />
                        {b?.member?.phone || "—"}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span style={{ opacity: 0.8 }}>Package type</span>
                      <span>{getPackageType(b)}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span style={{ opacity: 0.8 }}>Session Count</span>
                         <span>
                        {totalSessions === null && remainingSessions !== null
                          ? `${remainingSessions} / —`
                          : totalSessions === null
                          ? b?.sessions_count ?? "—"
                          : `${remainingSessions ?? "—"} / ${totalSessions}`}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span style={{ opacity: 0.8 }}>Status</span>
                      <span>{String(b?.status || "—")}</span>
                    </div>
                    <div className="d-flex justify-content-between align-items-center">
                      <span style={{ opacity: 0.8 }}>Session confirmation</span>
                      <button
                        className="btn btn-sm btn-outline-info"
                        onClick={() => confirmSession(bookingId)}
                        disabled={isCompleted || busyKey === `confirm-${bookingId}`}
                        title={isCompleted ? "All sessions completed" : "Confirm this session"}
                      >
                        {busyKey === `confirm-${bookingId}` ? "..." : "Confirm"}
                      </button>
                    </div>
                  </div>

                  {b?.notes && (
                    <div className="small mt-2" style={{ opacity: 0.9 }}>
                      {b.notes}
                    </div>
                  )}
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
