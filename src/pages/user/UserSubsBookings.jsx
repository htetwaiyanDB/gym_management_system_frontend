import React, { useCallback, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";
import useRealtimePolling from "../../hooks/useRealtimePolling";
import UserBookings from "./UserBookings";
import UserSubscriptions from "./UserSubscriptions";
import UserClassSubscriptions from "./UserClassSubscriptions";
import { FaCalendar, FaClock, FaPhoneAlt, FaUser } from "react-icons/fa";

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

function getBookingBillingMode(booking) {
  const normalizeMode = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    if (["month", "months", "monthly"].includes(raw)) return "monthly";
    if (["session", "sessions", "personal"].includes(raw)) return "session";
    return raw;
  };

  const candidates = [
    booking?.billing_type,
    booking?.base_type,
    booking?.package_base,
    booking?.duration_type,
    booking?.plan_type,
    booking?.boxing_package?.billing_type,
    booking?.boxing_package?.base_type,
    booking?.boxing_package?.package_base,
    booking?.boxing_package?.duration_type,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeMode(candidate);
    if (normalized === "monthly" || normalized === "session") return normalized;
  }

  return "";
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

function getStartDateValue(booking) {
  return pick(booking, ["start_date", "starts_at", "start_time", "session_datetime", "date"]);
}

function getEndDateValue(booking) {
  return pick(booking, ["end_date", "ends_at", "expiry_date", "expires_at", "expiration_date"]);
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

function isMonthlyBasedBooking(booking) {
  const explicitBillingMode = getBookingBillingMode(booking);
  if (explicitBillingMode === "monthly") return true;
  if (explicitBillingMode === "session") return false;

  if (isMonthlyPackageType(getPackageType(booking))) return true;

  const packageName = String(
    pick(booking, ["package_name", "plan_name", "name", "title"]) ||
      pick(booking?.boxing_package, ["name", "title", "package_name", "plan_name"]) ||
      ""
  ).toLowerCase();
  if (packageName.includes("month")) return true;

  const explicitMonthCount = toNumber(
    pick(booking, ["months_count", "month_count", "duration_months", "months", "duration"])
  );
  if (explicitMonthCount !== null && explicitMonthCount > 0) return true;

  return Boolean(
    pick(booking, ["month_start_date", "monthly_start_date", "month_end_date", "monthly_end_date"])
  );
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

function getPricingDetails(booking) {
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
}

function normalizeStatusFilter(statusValue) {
  const s = String(statusValue || "").toLowerCase();
  if (s.includes("pending")) return "pending";
  if (s.includes("active")) return "active";
  if (s.includes("hold")) return "on-hold";
  if (s.includes("complete") || s.includes("done")) return "complete";
  return s;
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
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [date, setDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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
      const dateMatch = !date || getDate(b) === date;
      const resolvedStatus = String(resolveBookingStatus(b) || "").toLowerCase();
      const statusMatch =
        statusFilter === "all" || normalizeStatusFilter(resolvedStatus) === statusFilter;
      return dateMatch && statusMatch;
    });
  }, [bookings, date, statusFilter]);

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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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

      {error && <div className="alert alert-danger">{error}</div>}

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {loading ? (
        <div style={cardStyle}>Loading bookings...</div>
      ) : filtered.length === 0 ? (
        <div style={cardStyle}>No bookings found.</div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {filtered.map((b, i) => {
            const bookingId = b?.id ?? i;
            const { total: totalSessions, remaining: remainingSessions } = getSessionProgress(b);
            const isMonthlyPackage = isMonthlyBasedBooking(b);
            const monthCount = getMonthCount(b);
            const isCompleted =
              remainingSessions === 0 || isCompletedStatus(resolveBookingStatus(b));
            const { totalPrice, discountPercent, finalPrice } = getPricingDetails(b);
            const discountPercentNum = Number(discountPercent);
            const hasDiscount = Number.isFinite(discountPercentNum) && discountPercentNum > 0;
            const successPriceText = {
              color: "#198754",
              fontWeight: 800,
            };
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
                    setSelectedId((prev) => (prev === bookingId ? null : bookingId));
                  }
                }}
              >
                <div className="d-flex justify-content-between">
                  <div style={{ fontWeight: 900 }}>{getCoachName(b)}</div>
                  <span style={statusPill(resolveBookingStatus(b))}>
                    {String(resolveBookingStatus(b) || "ACTIVE").toUpperCase()}
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
                        <span style={{ fontWeight: 700 }}>{getCoachName(b)}</span>
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
                          {getCoachPhone(b)}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span style={{ opacity: 0.8 }}>Package type</span>
                        <span>{getPackageType(b)}</span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span style={{ opacity: 0.8 }}>
                          Count
                        </span>
                        <span>
                          {isMonthlyPackage
                            ? monthCount === null
                              ? "—"
                              : `${monthCount} / ${monthCount}`
                            : totalSessions === null && remainingSessions !== null
                            ? `${remainingSessions} / —`
                            : totalSessions === null
                            ? b?.sessions_count ?? "—"
                            : `${remainingSessions ?? "—"} / ${totalSessions}`}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span style={{ opacity: 0.8 }}>Status</span>
                        <span>{String(resolveBookingStatus(b) || "—")}</span>
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          background:
                            "linear-gradient(120deg, rgba(13,110,253,0.18), rgba(102,16,242,0.18))",
                          border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Pricing</div>
                        <div className="d-flex justify-content-between">
                          <span style={{ opacity: 0.8 }}>Total price</span>
                          <b style={hasDiscount ? { textDecoration: "line-through", opacity: 0.85 } : undefined}>
                            {String(totalPrice ?? "—")}
                          </b>
                        </div>
                        <div className="d-flex justify-content-between">
                          <span style={hasDiscount ? successPriceText : { opacity: 0.8 }}>Discount %</span>
                          <b style={hasDiscount ? successPriceText : undefined}>
                            {String(discountPercent ?? "—")}
                          </b>
                        </div>
                        <div className="d-flex justify-content-between">
                          <span style={hasDiscount ? successPriceText : { opacity: 0.8 }}>Final price</span>
                          <b style={hasDiscount ? successPriceText : undefined}>
                            {String(finalPrice ?? "—")}
                          </b>
                        </div>
                      </div>
                      {!isMonthlyPackage && (
                        <div className="d-flex justify-content-between align-items-center">
                          <span style={{ opacity: 0.8 }}>Session confirmation</span>
                          <button
                            className="btn btn-sm btn-outline-info"
                            onClick={() => confirmSession(bookingId)}
                            disabled={isCompleted || busyKey === `confirm-${bookingId}`}
                            title={
                              isCompleted ? "All sessions completed" : "Confirm this session"
                            }
                          >
                            {busyKey === `confirm-${bookingId}` ? "..." : "Confirm"}
                          </button>
                        </div>
                      )}
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

export default function UserSubsBookings() {
  const [activeTab, setActiveTab] = useState("subscriptions");

  const tabs = [
    { id: "subscriptions", label: "Memberships" },
    { id: "bookings", label: "Trainer Bookings" },
    { id: "boxing-bookings", label: "Boxing Bookings" },
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
      {activeTab === "boxing-bookings" && <UserBoxingBookings />}
      {activeTab === "class-subscriptions" && <UserClassSubscriptions embedded />}
    </div>
  );
}
