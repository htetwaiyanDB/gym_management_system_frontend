import React, { useCallback, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";
import useRealtimePolling from "../../hooks/useRealtimePolling";
import UserBookings from "./UserBookings";
import UserSubscriptions from "./UserSubscriptions";
import UserClassSubscriptions from "./UserClassSubscriptions";
import { FaPhoneAlt, FaUser } from "react-icons/fa";

function toText(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);

  if (typeof v === "object") {
    const name =
      v?.name || v?.full_name || v?.title || v?.email || v?.phone || null;
    if (name) return String(name);

    try {
      return JSON.stringify(v);
    } catch {
      return "[object]";
    }
  }

  return String(v);
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

function isMonthlyPackageType(value) {
  const s = String(value || "").toLowerCase();
  return s.includes("month");
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

function hasStarted(value) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return d.getTime() <= now.getTime();
}

function resolveBookingStatus(booking) {
  const rawStatus = String(booking?.status || booking?.state || "").toLowerCase();
  const startDate =
    booking?.start_date || booking?.starts_at || booking?.start_time || booking?.session_datetime;
  if (rawStatus === "pending" && hasStarted(startDate)) {
    return "active";
  }
  return rawStatus || booking?.status || booking?.state || "—";
}

function getStartDateValue(booking) {
  return pick(booking, ["start_date", "starts_at", "start_time", "session_datetime", "date", "month_start_date", "monthly_start_date", "sessions_start_date", "session_start_date"]);
}

function getEndDateValue(booking) {
  return pick(booking, ["end_date", "ends_at", "expiry_date", "expires_at", "expiration_date", "month_end_date", "monthly_end_date", "sessions_end_date", "session_end_date"]);
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

function isExpiredBooking(booking, status) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus.includes("expire")) return true;

  const endDateValue = getEndDateValue(booking);
  if (!endDateValue) return false;

  const endDate = parseDateValue(endDateValue);
  if (!endDate) return false;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return endDate.getTime() < now.getTime();
}

function getDisplayBookingStatus(booking) {
  const resolvedStatus = resolveBookingStatus(booking);
  return isExpiredBooking(booking, resolvedStatus) ? "expired" : resolvedStatus;
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
    pick(booking?.boxing_package, ["type", "package_type", "package_kind", "package_category"]) ||
    pick(booking?.package_detail, ["type", "package_type", "package_kind", "package_category"]) ||
    "—"
  );
}

function getMonthCount(booking) {
  const configuredMonths = toNumber(
    pick(booking, ["months_count", "month_count", "duration_months", "months", "duration"])
  );
  if (configuredMonths !== null && configuredMonths > 0) return configuredMonths;

  const start = parseDateValue(getStartDateValue(booking));
  const end = parseDateValue(getEndDateValue(booking));
  if (!start || !end || end.getTime() < start.getTime()) return null;

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const anchor = new Date(start);
  anchor.setMonth(anchor.getMonth() + months);
  if (end.getTime() > anchor.getTime()) months += 1;

  return Math.max(1, months);
}

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

  if (b?.date) return b.date;
  if (b?.start_date) return b.start_date;

  if (typeof dtRaw === "string" && dtRaw.length >= 10) return dtRaw.slice(0, 10);

  return "";
}

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

  if (b?.time) return b.time;

  if (typeof dtRaw === "string") {
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(dtRaw)) return dtRaw;
    const maybe = dtRaw.split(" ")[1] || dtRaw.split("T")[1];
    if (maybe) return maybe;
  }

  return "—";
}

function formatDisplayDate(value) {
  const d = parseBackendDateTime(value) || parseDateValue(value);
  if (!d) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function getCoachName(b) {
  return (
    pick(b, [
      "coach_name",
      "boxing_coach_name",
      "trainer_name",
      "boxing_trainer_name",
    ]) ||
    pick(b?.coach, ["name"]) ||
    pick(b?.trainer, ["name"]) ||
    "—"
  );
}

function getCoachPhone(b) {
  return (
    pick(b, [
      "coach_phone",
      "boxing_coach_phone",
      "trainer_phone",
      "boxing_trainer_phone",
    ]) ||
    pick(b?.coach, ["phone"]) ||
    pick(b?.trainer, ["phone"]) ||
    "—"
  );
}

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

function UserBoxingBookings() {
  const isMobile = useMemo(() => window.innerWidth < 768, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [filter, setFilter] = useState("all");
  const [bookings, setBookings] = useState([]);

  const fetchBookings = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    setMsg(null);

    try {
      const res = await axiosClient.get("/user/boxing-bookings");
      const list = normalizeBookings(res?.data);
      setBookings(list);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load boxing bookings.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtimePolling(fetchBookings, 12000, [fetchBookings]);

  const confirmSession = async (bookingId) => {
    if (!bookingId) return;
    setMsg(null);
    setBusyKey(`confirm-${bookingId}`);
    try {
      let res;
      try {
        res = await axiosClient.post(`/user/boxing-bookings/${bookingId}/confirm`);
      } catch (innerError) {
        if (innerError?.response?.status !== 404) {
          throw innerError;
        }
        res = await axiosClient.post(`/user/boxing-subscriptions/${bookingId}/confirm`);
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
    return bookings.filter((b) => {
      const s = getDisplayBookingStatus(b);
      const nameMatch =
        !search || getCoachName(b).toLowerCase().includes(search.toLowerCase());
      const sessionDateTime =
        pick(b, ["session_datetime", "session_time", "datetime", "date_time", "start_time", "starts_at"]) ||
        pick(b, ["booking_date", "date"]);
      const dateMatch = !date || String(sessionDateTime || "").slice(0, 10) === date;
      const statusMatch = filter === "all" || normalizeStatusFilter(s) === filter;
      return nameMatch && dateMatch && statusMatch;
    });
  }, [bookings, search, date, filter]);

  const normalizeStatusFilter = useCallback((statusValue) => {
    const s = String(statusValue || "").toLowerCase();
    if (s.includes("pending")) return "pending";
    if (s.includes("active")) return "active";
    if (s.includes("hold")) return "on-hold";
    if (s.includes("complete") || s.includes("done")) return "complete";
    return s;
  }, []);

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
    if (s.includes("expire")) return pill("rgba(220,53,69,0.55)");
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
          Boxing booking view is optimized for mobile.
        </div>
      </div>
    );
  }

  return (
    <div className="container py-3" style={{ maxWidth: 720 }}>
      <div style={cardStyle} className="mb-3">
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Boxing Bookings</div>
            <div className="small" style={{ opacity: 0.9 }}>
              From memberships
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

          <div className="mt-3 d-flex gap-2">
            <input
              className="form-control"
              placeholder="Search coach..."
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
            const status = getDisplayBookingStatus(b);
            const startDateValue = getStartDateValue(b);
            const endDateValue = getEndDateValue(b);
            const isExpired = isExpiredBooking(b, status);
            const { total: totalSessions, remaining: remainingSessions } = getSessionProgress(b);
            const isMonthlyPackage = isMonthlyPackageType(getPackageType(b));
            const monthCount = getMonthCount(b);
            const isCompleted =
              remainingSessions === 0 || isCompletedStatus(status);

            const service =
              pick(b, ["service", "service_name", "type", "category", "package_name"]) ||
              pick(b?.package, ["name", "title"]) ||
              pick(b?.boxing_package, ["name", "title"]) ||
              "—";

            const packageType = getPackageType(b);
            const note = pick(b, ["note", "remark", "message", "description"]);
            const paidStatus = pick(b, ["paid_status", "payment_status"]);

            const coachObj = b?.coach || b?.trainer;
            const coachName =
              getCoachName(b) !== "—"
                ? getCoachName(b)
                : typeof coachObj === "object"
                  ? (coachObj?.name || coachObj?.email || coachObj?.phone)
                  : coachObj || "—";

            const coachPhone =
              getCoachPhone(b) !== "—"
                ? getCoachPhone(b)
                : typeof coachObj === "object"
                  ? coachObj?.phone
                  : "—";

            const sessionDateTime =
              pick(b, [
                "session_datetime",
                "session_time",
                "datetime",
                "date_time",
                "start_time",
                "starts_at",
              ]) || pick(b, ["booking_date", "date"]);
            return (
              <div
                key={id}
                style={{
                  ...cardStyle,
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
                      Coach: {toText(coachName)}
                    </div>
                  </div>

                  <span style={statusPill(status)}>{String(status || "—").toUpperCase()}</span>
                </div>

                <div className="mt-2 d-flex gap-2 flex-wrap">
                  <span style={pill("rgba(255,255,255,0.12)")}>
                    {sessionDateTime ? String(sessionDateTime).slice(0, 10) : "—"}
                  </span>
                  <span style={pill("rgba(255,255,255,0.12)")}>
                    {sessionDateTime ? fmtDateTime(sessionDateTime).split(", ")[1] || "—" : "—"}
                  </span>
                  <span style={pill("rgba(255,255,255,0.12)")}>Start: {startDateValue ? String(startDateValue).slice(0, 10) : "—"}</span>
                  <span style={pill(isExpired ? "rgba(220,53,69,0.45)" : "rgba(255,255,255,0.12)")}>End: {endDateValue ? String(endDateValue).slice(0, 10) : "—"}</span>
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
                        <span style={{ fontWeight: 700 }}>{toText(coachName)}</span>
                      </div>
                      {paidStatus ? (
                        <span style={pill("rgba(25,135,84,0.35)")}>{String(paidStatus).toUpperCase()}</span>
                      ) : null}
                    </div>

                    <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Phone</span>
                      <span className="d-flex align-items-center gap-2">
                        <FaPhoneAlt />
                        {toText(coachPhone)}
                      </span>
                    </div>

                    <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Package type</span>
                      <b style={{ textAlign: "right" }}>{toText(packageType)}</b>
                    </div>

                    <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>
                        Count
                      </span>
                      <b style={{ textAlign: "right" }}>
                        {isMonthlyPackage
                          ? toText(
                              monthCount ??
                                pick(b, ["months_count", "month_count", "duration_months", "months", "duration"])
                            )
                          : totalSessions === null
                          ? toText(b?.sessions_count)
                          : `${remainingSessions ?? "—"} / ${totalSessions}`}
                      </b>
                    </div>

                    <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Start date</span>
                      <b style={{ textAlign: "right" }}>{startDateValue ? String(startDateValue).slice(0, 10) : "—"}</b>
                    </div>

                    <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>End date</span>
                      <b style={{ textAlign: "right", color: isExpired ? "#ff9aa2" : undefined }}>
                        {endDateValue ? String(endDateValue).slice(0, 10) : "—"}
                      </b>
                    </div>

                    <div className="d-flex justify-content-between" style={{ gap: 12 }}>
                      <span style={{ opacity: 0.8 }}>Status</span>
                      <b style={{ textAlign: "right" }}>{toText(status)}</b>
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

export default function UserSubsBookings() {
  const [activeTab, setActiveTab] = useState("subscriptions");

  const tabs = [
    { id: "subscriptions", label: "Memberships" },
    { id: "bookings", label: "Trainer Bookings" },
    { id: "class-subscriptions", label: "Class Memberships" },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>Subs & Books</h2>

      <div className="d-flex gap-2 flex-wrap" style={{ marginBottom: 16 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`btn btn-sm ${activeTab === tab.id ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "subscriptions" && <UserSubscriptions />}
      {activeTab === "bookings" && <UserBookings />}
      {activeTab === "class-subscriptions" && <UserClassSubscriptions embedded />}
    </div>
  );
}
