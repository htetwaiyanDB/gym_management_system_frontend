import React, { useCallback, useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";
import useRealtimePolling from "../../hooks/useRealtimePolling";
import { FaPhoneAlt, FaUser } from "react-icons/fa";

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

function formatDDMMYYYY(d) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatYYYYMMDD(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateOnly(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const dateOnly = s.includes("T") ? s.split("T")[0] : s.split(" ")[0];
  const parts = dateOnly.split("-").map((part) => Number(part));
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;

  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function isExpiredByDate(endDateValue) {
  const endDate = parseDateOnly(endDateValue);
  if (!endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > endDate;
}

function normalizeBookingStatus(value) {
  const s = String(value || "").toLowerCase();
  if (s === "confirmed") return "active";
  if (s === "cancelled" || s === "canceled") return "on-hold";
  if (s === "hold" || s === "on-hold") return "on-hold";
  if (s === "completed" || s === "complete" || s === "done") return "completed";
  return s || "pending";
}

function getBookingEndDateValue(booking) {
  return pick(booking, [
    "month_end_date",
    "monthly_end_date",
    "sessions_end_date",
    "session_end_date",
    "end_date",
    "expires_at",
    "expiration_date",
    "ends_at",
  ]);
}

function getBookingStartDateValue(booking) {
  return pick(booking, [
    "month_start_date",
    "monthly_start_date",
    "sessions_start_date",
    "session_start_date",
    "start_date",
    "starts_at",
  ]);
}

function getDisplayBookingStatus(booking) {
  const normalizedStatus = normalizeBookingStatus(booking?.status);
  if (normalizedStatus === "active" && isExpiredByDate(getBookingEndDateValue(booking))) {
    return "expired";
  }
  return normalizedStatus;
}

function formatDisplayDate(value) {
  const d = parseBackendDateTime(value) || parseDateOnly(value);
  if (!d) return "—";
  return formatDDMMYYYY(d);
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
  // For boxing bookings, check common package type fields
  const boxingPackageType =
    booking?.package_type ||
    booking?.boxing_package?.package_type ||
    booking?.boxing_package?.type ||
    booking?.boxing_package?.name ||
    booking?.package_name;
  if (boxingPackageType) return boxingPackageType;

  return (
    pick(booking, ["package_type", "package_type_name", "package_category", "package_kind"]) ||
    pick(booking?.package, ["type", "package_type", "package_kind", "package_category"]) ||
    pick(booking?.trainer_package, ["type", "package_type", "package_kind", "package_category"]) ||
    pick(booking?.boxing_package, ["type", "package_type", "package_kind", "package_category"]) ||
    pick(booking?.package_detail, ["type", "package_type", "package_kind", "package_category"]) ||
    "—"
  );
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
    booking?.package?.billing_type,
    booking?.package?.base_type,
    booking?.package?.package_base,
    booking?.package?.duration_type,
    booking?.trainer_package?.billing_type,
    booking?.trainer_package?.base_type,
    booking?.trainer_package?.package_base,
    booking?.trainer_package?.duration_type,
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

function isMonthlyBasedBooking(booking) {
  const explicitBillingMode = getBookingBillingMode(booking);
  if (explicitBillingMode === "monthly") return true;
  if (explicitBillingMode === "session") return false;

  const packageType = getPackageType(booking);
  if (isMonthlyPackageType(packageType)) return true;

  const packageName = String(
    pick(booking, ["package_name", "plan_name", "name", "title"]) ||
      pick(booking?.package, ["name", "title", "package_name", "plan_name"]) ||
      pick(booking?.trainer_package, ["name", "title", "package_name", "plan_name"]) ||
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
  if (d) return formatDDMMYYYY(d);

  if (b?.date) return formatDisplayDate(b.date);
  if (b?.start_date) return formatDisplayDate(b.start_date);
  if (typeof dtRaw === "string" && dtRaw.length >= 10) return formatDisplayDate(dtRaw);

  return "";
}

function isMatchingSelectedDate(booking, selectedDate) {
  if (!selectedDate) return true;
  const bookingDateValue =
    booking?.session_datetime ||
    booking?.session_time ||
    booking?.datetime ||
    booking?.date_time ||
    booking?.starts_at ||
    booking?.start_time ||
    booking?.date ||
    booking?.start_date;

  const bookingDate = parseBackendDateTime(bookingDateValue) || parseDateOnly(bookingDateValue);
  if (!bookingDate) return false;
  return formatYYYYMMDD(bookingDate) === selectedDate;
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
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(dtRaw)) return dtRaw.slice(0, 5);
    const maybe = dtRaw.split(" ")[1] || dtRaw.split("T")[1];
    if (maybe) return maybe.slice(0, 5);
  }

  return "—";
}

function extractBookings(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.bookings)) return payload.bookings;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.bookings)) return payload.data.bookings;
  if (Array.isArray(payload?.bookings?.data)) return payload.bookings.data;
  return [];
}

async function runFirstSuccessfulRequest(candidates) {
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return await candidate();
    } catch (error) {
      const status = error?.response?.status;
      if (status && ![404, 405].includes(status)) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError || new Error("No matching endpoint found.");
}

export default function TrainerBooking() {
  const isMobile = useMemo(() => window.innerWidth < 768, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const [activeTab, setActiveTab] = useState("trainer");
  const [trainerBookings, setTrainerBookings] = useState([]);
  const [boxingBookings, setBoxingBookings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");

  const fetchTrainerBookings = useCallback(async () => {
    const res = await axiosClient.get("/trainer/subscriptions");
    setTrainerBookings(extractBookings(res?.data));
  }, []);

  const fetchBoxingBookings = useCallback(async () => {
    const res = await runFirstSuccessfulRequest([
      () => axiosClient.get("/trainer/boxing-bookings"),
      () => axiosClient.get("/trainer/boxing-subscriptions"),
    ]);
    setBoxingBookings(extractBookings(res?.data));
  }, []);

  const fetchBookings = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    setMsg(null);

    try {
      await Promise.all([fetchTrainerBookings(), fetchBoxingBookings()]);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load bookings.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchTrainerBookings, fetchBoxingBookings]);

  useRealtimePolling(fetchBookings, 12000, [fetchBookings]);

  useEffect(() => {
    setSelectedId(null);
  }, [activeTab]);

  const confirmSession = async (bookingId) => {
    if (!bookingId) return;
    setMsg(null);
    setBusyKey(`confirm-${bookingId}`);
    try {
      const res = await axiosClient.post(`/trainer/bookings/${bookingId}/confirm`);
      setMsg({ type: "success", text: res?.data?.message || "Session confirmed." });
      await fetchTrainerBookings();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to confirm session.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const confirmBoxingSession = async (bookingId) => {
    if (!bookingId) return;
    setMsg(null);
    setBusyKey(`confirm-boxing-${bookingId}`);
    try {
      const res = await runFirstSuccessfulRequest([
        () => axiosClient.post(`/trainer/boxing-bookings/${bookingId}/confirm`),
        () => axiosClient.patch(`/trainer/boxing-bookings/${bookingId}/confirm`),
        () => axiosClient.post(`/trainer/boxing-bookings/${bookingId}/mark-active`),
        () => axiosClient.patch(`/trainer/boxing-bookings/${bookingId}/mark-active`),
      ]);
      setMsg({ type: "success", text: res?.data?.message || "Boxing session confirmed." });
      await fetchBoxingBookings();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to confirm boxing session.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const currentBookings = activeTab === "trainer" ? trainerBookings : boxingBookings;

  const filtered = useMemo(() => {
    return currentBookings.filter((b) => {
      const nameMatch =
        !search || getMemberName(b).toLowerCase().includes(search.toLowerCase());
      const dateMatch = isMatchingSelectedDate(b, date);
      return nameMatch && dateMatch;
    });
  }, [currentBookings, search, date]);

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
    if (s.includes("expired")) return pill("rgba(220,53,69,0.7)");
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
      <div style={cardStyle} className="mb-3">
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              {activeTab === "trainer" ? "Trainer Bookings" : "Boxing Bookings"}
            </div>
            <div className="small" style={{ opacity: 0.9 }}>
              {activeTab === "trainer" ? "From subscriptions" : "From boxing bookings"}
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
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "trainer" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setActiveTab("trainer")}
          >
            Trainer Booking Tag
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "boxing" ? "btn-primary" : "btn-outline-light"}`}
            onClick={() => setActiveTab("boxing")}
          >
            Boxing Booking Tag
          </button>
        </div>

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

      {loading ? (
        <div style={cardStyle}>Loading bookings...</div>
      ) : filtered.length === 0 ? (
        <div style={cardStyle}>No bookings found.</div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {filtered.map((b, i) => {
            const bookingId = b?.id ?? i;
            const packageType = getPackageType(b);
            const isMonthlyPackage = isMonthlyBasedBooking(b);
            const displayStatus = getDisplayBookingStatus(b);
            const startDate = getBookingStartDateValue(b);
            const endDate = getBookingEndDateValue(b);
            const { total: totalSessions, remaining: remainingSessions } = getSessionProgress(b);
            const isCompleted =
              remainingSessions === 0 || isCompletedStatus(displayStatus);
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
                  <span style={statusPill(displayStatus)}>
                    {String(displayStatus || "ACTIVE").toUpperCase()}
                  </span>
                </div>

                <div className="mt-2 d-flex gap-2 flex-wrap">
                  <span style={pill("rgba(255,255,255,0.12)")}>
                    {getDate(b) || "—"}
                  </span>
                  <span style={pill("rgba(255,255,255,0.12)")}>
                    {getTime(b)}
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
                          {b?.member?.phone || b?.user?.phone || "—"}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span style={{ opacity: 0.8 }}>Package type</span>
                        <span>{packageType}</span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span style={{ opacity: 0.8 }}>Count</span>
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
                        <span>{String(displayStatus || "—")}</span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span style={{ opacity: 0.8 }}>Start Date</span>
                        <span>{formatDisplayDate(startDate)}</span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span style={{ opacity: 0.8 }}>End Date</span>
                        <span>{formatDisplayDate(endDate)}</span>
                      </div>

                        {!isMonthlyPackage && (
                        <div className="d-flex justify-content-between align-items-center">
                          <span style={{ opacity: 0.8 }}>Session confirmation</span>
                          <button
                            className="btn btn-sm btn-outline-info"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeTab === "trainer") {
                                confirmSession(bookingId);
                              } else {
                                confirmBoxingSession(bookingId);
                              }
                            }}
                            disabled={isCompleted || busyKey === `confirm-${bookingId}` || busyKey === `confirm-boxing-${bookingId}`}
                            title={isCompleted ? "All sessions completed" : "Confirm this session"}
                          >
                            {busyKey === `confirm-${bookingId}` || busyKey === `confirm-boxing-${bookingId}` ? "..." : "Confirm"}
                          </button>
                        </div>
                      )}
                    </div>

                    {b?.notes && (
                      <div className="small mt-2" style={{ opacity: 0.9 }}>
                        <span style={{ fontWeight: 700 }}>Noted:</span> {b.notes}
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
