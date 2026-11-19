import React, { useEffect, useMemo, useRef, useState } from "react";
import axiosClient from "../../api/axiosClient";
import { scanRfidAttendance } from "../../api/attendanceApi";
import RfidInputListener from "../../components/RfidInputListener";
import { isCardNotRegisteredError, normalizeCardId } from "../../utils/rfid";
import { awardScanPoints } from "../../api/pointsApi";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "../../utils/dateFormat";

function parseBackendDateTime(s) {
  if (!s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDateTimeVideoStyle(s) {
  const d = parseBackendDateTime(s);
  if (!d) return "-";
  return formatDateTimeDDMMYYYY(d);
}

function roleBadge(role) {
  const r = String(role || "").toLowerCase();
  if (r === "trainer") return <span className="badge bg-info text-dark">Trainer</span>;
  if (r === "user") return <span className="badge bg-primary">User</span>;
  if (r === "admin" || r === "administrator") return <span className="badge bg-warning text-dark">Admin</span>;
  return <span className="badge bg-secondary">{role || "Unknown"}</span>;
}

const normalizeRecordType = (record) => {
  const rawType = String(record?.type || record?.scan_type || record?.action || "").toLowerCase();
  if (rawType === "in") return "check_in";
  if (rawType === "out") return "check_out";
  return rawType;
};

const normalizeRecord = (record) => ({
  name: record?.name || record?.user_name || record?.username || record?.user?.name || "-",
  role: record?.role || record?.user_role || record?.user?.role || "-",
  scannedAt: record?.scanned_at || record?.created_at || record?.time || record?.timestamp,
  type: normalizeRecordType(record),
  userId: record?.user_id || record?.user?.id || record?.member_id,
});

const getRecordUserKey = (record, fallback = "-") =>
  record?.user_id ||
  record?.userId ||
  record?.user?.id ||
  record?.member_id ||
  `${record?.name || record?.user_name || record?.username || fallback}-${record?.role || record?.user_role || fallback}`;

const getRecordDayKey = (value) => {
  const d = parseBackendDateTime(value);
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};


const n = (v) => {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
};

const deepGet = (obj, path) => {
  try {
    return path.split(".").reduce((acc, k) => acc?.[k], obj);
  } catch {
    return undefined;
  }
};

const deepPick = (obj, paths, fallback = 0) => {
  for (const p of paths) {
    const v = p.includes(".") ? deepGet(obj, p) : obj?.[p];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
};

const sumArr = (arr = []) => arr.reduce((a, b) => a + n(b), 0);

const normalizeScanStatus = (record) => {
  const type = normalizeRecordType(record);
  if (type === "check_in") return "Check-in";
  if (type === "check_out") return "Check-out";
  if (type) return type.replace("_", " ");
  return "—";
};

const extractScanPayload = (payload) => {
  if (!payload) return { user: null, attendance: null, message: null };
  const user = payload.user ?? payload.member ?? payload.data?.user ?? payload.data?.member ?? null;
  const attendance =
    payload.attendance ??
    payload.record ??
    payload.scan ??
    payload.data?.attendance ??
    payload.data?.record ??
    (payload.data && typeof payload.data === "object" ? payload.data : null);
  return { user, attendance, message: payload.message ?? payload.data?.message ?? null };
};

const firstValue = (source, keys) => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
};

const planEndDate = (record) => firstValue(record, [
  "end_date",
  "month_end_date",
  "monthly_end_date",
  "sessions_end_date",
  "session_end_date",
  "ends_at",
]);

const planDisplayName = (record) =>
  firstValue(record, [
    "plan_name",
    "package_name",
    "membership_plan_name",
    "trainer_package_name",
    "boxing_package_name",
    "name",
    "title",
  ]) ??
  firstValue(
    record?.membership_plan ?? record?.trainer_package ?? record?.boxing_package ?? record?.plan ?? record?.package,
    ["name", "title", "plan_name", "package_name"],
  ) ??
  "Plan";

const isActivePlanRecord = (record) => {
  const endDate = parseBackendDateTime(planEndDate(record));
  if (!endDate) return false;
  endDate.setHours(23, 59, 59, 999);
  if (endDate < new Date()) return false;

  const status = String(record?.status ?? record?.subscription_status ?? record?.state ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (["expired", "completed", "complete", "done", "on-hold", "hold", "cancelled", "canceled"].includes(status)) {
    return false;
  }
  if ([true, 1, "1", "true"].includes(record?.is_expired)) return false;

  const startDate = parseBackendDateTime(
    firstValue(record, ["start_date", "month_start_date", "sessions_start_date", "session_start_date"]),
  );
  if (startDate && startDate > new Date()) return false;

  return ["", "active", "confirmed", "resumed", "pending"].includes(status);
};

const newestActivePlan = (records, type) => {
  const active = (Array.isArray(records) ? records : [])
    .filter(isActivePlanRecord)
    .sort((a, b) => (parseBackendDateTime(planEndDate(b))?.getTime() ?? 0) - (parseBackendDateTime(planEndDate(a))?.getTime() ?? 0));
  if (active.length === 0) return null;
  return {
    type,
    name: planDisplayName(active[0]),
    endDate: planEndDate(active[0]),
  };
};

const buildPlanReminders = (payload) => [
  newestActivePlan(payload?.subscriptions ?? payload?.memberships, "Membership"),
  newestActivePlan(payload?.trainer_bookings ?? payload?.trainerbookings, "Trainer"),
  newestActivePlan(payload?.boxing_bookings ?? payload?.boxingbookings, "Boxing"),
].filter(Boolean);

const loadUserPlanReminders = async (userId) => {
  let response;
  try {
    response = await axiosClient.get(`/user/${userId}/records`, { cache: false });
  } catch (error) {
    if (error?.response?.status !== 404) throw error;
    response = await axiosClient.get(`/users/${userId}/records`, { cache: false });
  }
  return buildPlanReminders(response?.data || {});
};


const normalizeReportPayload = (resData) => {
  let payload =
    resData?.data ??
    resData?.report ??
    resData?.payload ??
    resData?.result ??
    resData?.attendance_report ??
    resData?.summary ??
    resData;

  const unwrapKeys = ["data", "report", "stats", "summary", "attendance_report", "payload", "result"];

  let guard = 0;
  while (payload && typeof payload === "object" && guard < 8) {
    guard++;
    const keys = Object.keys(payload);

    if (keys.length === 1 && unwrapKeys.includes(keys[0])) {
      payload = payload[keys[0]];
      continue;
    }

    let moved = false;
    for (const k of unwrapKeys) {
      if (payload?.[k] && typeof payload[k] === "object") {
        payload = payload[k];
        moved = true;
        break;
      }
    }
    if (moved) continue;

    break;
  }

  return payload || {};
};


/**
 * Inline styles only (no global CSS changes)
 */
const cardGlass = {
  background: "rgba(8,12,18,0.62)",
  border: "1px solid rgba(255,255,255,0.22)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.45)",
};

const titleText = { color: "rgba(255,255,255,0.92)" };
const bodyText = { color: "rgba(255,255,255,0.80)" };
const mutedText = { color: "rgba(255,255,255,0.60)" };

const SCAN_COOLDOWN_MS = 1500;

export default function AdminAttendance() {
  const [activeTab, setActiveTab] = useState("records"); // records | checked
  const [msg, setMsg] = useState(null);
  const scanInputRef = useRef(null);
  const scanTimeoutRef = useRef(null);
  const cardCooldownsRef = useRef(new Map());

  // Records
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [recordSearch, setRecordSearch] = useState("");
  const [recordStartDateFilter, setRecordStartDateFilter] = useState("");
  const [recordEndDateFilter, setRecordEndDateFilter] = useState("");

  // Member card scan panel
  const [scanValue, setScanValue] = useState("");
  const [activeScanCount, setActiveScanCount] = useState(0);
  const [scanError, setScanError] = useState(null);
  const [scanResult, setScanResult] = useState(null);

  // Checked-in
  const [checkedLoading, setCheckedLoading] = useState(false);
  const [checkedSummary, setCheckedSummary] = useState({ total_members: 0, active_checkins: 0 });
  const [checkedUsers, setCheckedUsers] = useState([]);
  const [activeCheckinsLoading, setActiveCheckinsLoading] = useState(false);
  const [memberCountLoading, setMemberCountLoading] = useState(false);

  const showError = (text) => {
    setMsg({ type: "danger", text });
  };

  const scanLoading = activeScanCount > 0;
  const scannerActive = true;

  // ---------------- API calls ----------------

  const loadMemberCount = async (clearMsg = false) => {
    if (clearMsg) setMsg(null);
    setMemberCountLoading(true);
    try {
      const res = await axiosClient.get("/attendance/users");
      const list = res.data?.users || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      const users = Array.isArray(list) ? list : [];
      const totalMembers = users.filter((u) => String(u?.role || "").toLowerCase() === "user").length;

      setCheckedSummary((prev) => ({
        ...prev,
        total_members: totalMembers,
      }));
    } catch (e) {
      showError(e?.response?.data?.message || "Failed to load member count.");
    } finally {
      setMemberCountLoading(false);
    }
  };


  const loadActiveCheckins = async (clearMsg = false) => {
    if (clearMsg) setMsg(null);
    setActiveCheckinsLoading(true);
    try {
      const res = await axiosClient.get("/dashboard/attendance-report");
      const payload = normalizeReportPayload(res?.data || {});
      const checkInsArr = Array.isArray(payload.check_ins) ? payload.check_ins : [];
      const checkOutsArr = Array.isArray(payload.check_outs) ? payload.check_outs : [];
      const sumIn = sumArr(checkInsArr);
      const sumOut = sumArr(checkOutsArr);
      const activeCheckins = n(
        deepPick(payload, ["cards.active_check_ins", "active_checkins", "active_check_ins"], sumIn - sumOut)
      );

      setCheckedSummary((prev) => ({
        ...prev,
        active_checkins: activeCheckins,
      }));
    } catch (e) {
      showError(e?.response?.data?.message || "Failed to load active check-ins.");
    } finally {
      setActiveCheckinsLoading(false);
    }
  };

  // NOTE: added optional param "clearMsg" default false
  const loadCheckedIn = async (clearMsg = false) => {
    if (clearMsg) setMsg(null);
    setCheckedLoading(true);
    try {
      const res = await axiosClient.get("/attendance/records");
      const list = res.data?.records || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      const normalized = Array.isArray(list) ? list.map(normalizeRecord) : [];

      const latestByUser = new Map();
      const uniqueKeys = new Set();

      normalized.forEach((record) => {
        const key = record.userId || `${record.name}-${record.role}`;
        uniqueKeys.add(key);
        const ts = parseBackendDateTime(record.scannedAt)?.getTime() ?? 0;
        const prev = latestByUser.get(key);
        if (!prev || ts > prev.ts) {
          latestByUser.set(key, { ...record, ts });
        }
      });

      const activeUsers = Array.from(latestByUser.values())
        .filter((record) => record.type === "check_in")
        .sort((a, b) => b.ts - a.ts);

      setCheckedSummary((prev) => ({
        ...prev,
      }));
      setCheckedUsers(activeUsers);
    } catch (e) {
      showError(e?.response?.data?.message || "Failed to load checked-in users.");
    } finally {
      setCheckedLoading(false);
    }
  };

  // NOTE: added optional param "clearMsg" default false
  const loadRecords = async (clearMsg = false) => {
    if (clearMsg) setMsg(null);
    setRecordsLoading(true);
    try {
      const res = await axiosClient.get("/attendance/records");
      const list = res.data?.records || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setRecords(Array.isArray(list) ? list : []);
    } catch (e) {
      showError(e?.response?.data?.message || "Failed to load attendance records.");
    } finally {
      setRecordsLoading(false);
    }
  };

  // ---------------- effects ----------------

  useEffect(() => {
    if (!scanResult && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [scanResult]);

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        window.clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab === "records") loadRecords(true);
    if (activeTab === "checked") {
      loadCheckedIn(true);
      loadActiveCheckins(false);
      loadMemberCount(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "checked") return undefined;
    const intervalId = window.setInterval(() => {
      loadCheckedIn(false);
      loadActiveCheckins(false);
      loadMemberCount(false);
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [activeTab]);

  // ---------------- computed ----------------

  const filteredRecords = useMemo(() => {
    const search = recordSearch.trim().toLowerCase();
    const startDateF = recordStartDateFilter;
    const endDateF = recordEndDateFilter;

    const list = Array.isArray(records) ? [...records] : [];

    // newest first
    list.sort((a, b) => {
      const ta = parseBackendDateTime(a?.scanned_at || a?.created_at)?.getTime() ?? 0;
      const tb = parseBackendDateTime(b?.scanned_at || b?.created_at)?.getTime() ?? 0;
      return tb - ta;
    });

    return list.filter((r) => {
      const name = String(r?.name || r?.user_name || r?.username || "").trim();
      const scannedAt = r?.scanned_at || r?.created_at || r?.time || r?.timestamp;
      const dayKey = getRecordDayKey(scannedAt);

      if (startDateF && (!dayKey || dayKey < startDateF)) return false;
      if (endDateF && (!dayKey || dayKey > endDateF)) return false;

      if (search && !name.toLowerCase().includes(search)) return false;

      return true;
    });
  }, [records, recordSearch, recordStartDateFilter, recordEndDateFilter]);

  const recordDayCounts = useMemo(() => {
    const dayActionByUser = new Map();
    const list = Array.isArray(records) ? records : [];

    list.forEach((record) => {
      const name = record?.name || record?.user_name || record?.username || "-";
      const role = record?.role || record?.user_role || "-";
      const key = getRecordUserKey({ ...record, name, role }, `${name}-${role}`);
      const scannedAt = record?.scanned_at || record?.created_at || record?.time || record?.timestamp;
      const dayKey = getRecordDayKey(scannedAt);
      const action = normalizeRecordType(record);
      if (!key || !dayKey) return;
      if (action !== "check_in" && action !== "check_out") return;

      if (!dayActionByUser.has(key)) {
        dayActionByUser.set(key, new Map());
      }
      const days = dayActionByUser.get(key);
      if (!days.has(dayKey)) {
        days.set(dayKey, { hasCheckIn: false, hasCheckOut: false });
      }
      const state = days.get(dayKey);
      if (action === "check_in") state.hasCheckIn = true;
      if (action === "check_out") state.hasCheckOut = true;
    });

    const counts = new Map();
    dayActionByUser.forEach((days, key) => {
      let completedDays = 0;
      days.forEach((state) => {
        if (state.hasCheckIn && state.hasCheckOut) {
          completedDays += 1;
        }
      });
      counts.set(key, completedDays);
    });
    return counts;
  }, [records]);

  const handleScanSubmit = async (rawValue) => {
    if (!scannerActive) return;

    const cardId = normalizeCardId(rawValue);
    if (!cardId) {
      setScanError("Please scan a valid member card.");
      return;
    }

    const lockUntil = cardCooldownsRef.current.get(cardId) ?? 0;
    const msRemaining = lockUntil - Date.now();
    if (msRemaining > 0) {
      const secondsLeft = Math.ceil(msRemaining / 1000);
      setScanError(`Please wait ${secondsLeft} second${secondsLeft === 1 ? "" : "s"} before scanning this card again.`);
      setScanValue("");
      setTimeout(() => scanInputRef.current?.focus(), 0);
      return;
    }
    cardCooldownsRef.current.set(cardId, Date.now() + SCAN_COOLDOWN_MS);

    setActiveScanCount((count) => count + 1);
    setScanError(null);

    try {
      const res = await scanRfidAttendance(cardId);
      const payload = res?.data ?? {};
      const { user, attendance, message } = extractScanPayload(payload);

      setScanResult({
        user,
        attendance,
        message: message || "Scan recorded successfully.",
        planReminders: [],
        planRemindersLoading: String(user?.role || "").toLowerCase() === "user",
      });

      const scannedUserId =
        user?.id ??
        user?.user_id ??
        attendance?.user_id ??
        attendance?.user?.id ??
        attendance?.member_id ??
        null;
      const scannedAction = normalizeRecordType(attendance);
      if (scannedUserId && (scannedAction === "check_in" || scannedAction === "check_out")) {
        await awardScanPoints({ userId: scannedUserId, action: scannedAction, points: 50 });
      }

      if (scannedUserId && String(user?.role || "").toLowerCase() === "user") {
        try {
          const planReminders = await loadUserPlanReminders(scannedUserId);
          setScanResult((current) => current ? {
            ...current,
            planReminders,
            planRemindersLoading: false,
          } : current);
        } catch {
          setScanResult((current) => current ? {
            ...current,
            planRemindersLoading: false,
          } : current);
        }
      }

      await Promise.all([loadRecords(false), loadCheckedIn(false), loadActiveCheckins(false), loadMemberCount(false)]);
      setScanValue("");
      setTimeout(() => scanInputRef.current?.focus(), 0);
    } catch (e) {
      const message = e?.response?.data?.message || "Unable to scan member card.";
      if (isCardNotRegisteredError(message)) {
        setScanError("This card is not registered. Please register the member card first.");
      } else {
        setScanError(message);
      }
    } finally {
      setActiveScanCount((count) => Math.max(0, count - 1));
    }
  };

  const handleScanChange = (event) => {
    const value = event.target.value;
    setScanValue(value);
    setScanError(null);

    if (scanTimeoutRef.current) {
      window.clearTimeout(scanTimeoutRef.current);
    }

    scanTimeoutRef.current = window.setTimeout(() => {
      handleScanSubmit(value);
    }, 250);
  };

  const handleScanKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleScanSubmit(scanValue);
  };

  const resetScanPanel = () => {
    setScanValue("");
    setScanResult(null);
    setScanError(null);
    if (scanInputRef.current) {
      scanInputRef.current.focus();
    }
  };


  // ---------------- render ----------------

  return (
    <div className="admin-card p-4">
      <div className="mb-3">
        <h4 className="mb-1" style={titleText}>
          Attendance Center
        </h4>
        <div className="admin-muted" style={mutedText}>
          Scan member RFID cards and monitor active gym users.
        </div>
      </div>

      <RfidInputListener
        active
        onScan={(value) => {
          setScanValue(value);
          handleScanSubmit(value);
        }}
      />

      <div className="mb-4" style={{ ...cardGlass, borderRadius: 16, padding: 18 }}>
          <div className="d-flex align-items-start justify-content-between mb-2">
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
                Member Card Scan
              </div>
              <div style={{ fontSize: 13, ...mutedText }}>Scan a member card to send it directly to the RFID attendance endpoint.</div>
            </div>
            <span className={`badge ${scanLoading ? "bg-warning text-dark" : "bg-success"}`}>
              {scanLoading ? "Scanning..." : "Ready"}
            </span>
          </div>

          <input
            ref={scanInputRef}
            type="text"
            className="form-control admin-search-input"
            value={scanValue}
            onChange={handleScanChange}
            onKeyDown={handleScanKeyDown}
            placeholder="Scan member card ID"
            autoComplete="off"
          />

          {scanError && (
            <div className="alert alert-danger mt-3 mb-0" role="alert">
              {scanError}
            </div>
          )}
        </div>

      {scanResult && (
        <div className="mb-4" style={{ ...cardGlass, borderRadius: 16, padding: 18 }}>
          <div className="d-flex align-items-start justify-content-between">
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
                Latest Scan Result
              </div>
              <div style={{ fontSize: 13, ...mutedText }}>Each valid card scan is sent directly to the RFID attendance endpoint.</div>
            </div>
            <span className="badge bg-success">Success</span>
          </div>

          {scanResult.message && (
            <div className="alert alert-success mt-3 mb-2" role="alert">
              {scanResult.message}
            </div>
          )}

          <div className="mt-3">
            <div className="d-flex justify-content-between mb-2" style={bodyText}>
              <span>Member ID</span>
              <strong>
                {scanResult.user?.member_id ||
                  scanResult.user?.memberId ||
                  scanResult.user?.id ||
                  scanResult.attendance?.member_id ||
                  scanResult.attendance?.user_id ||
                  "—"}
              </strong>
            </div>
            <div className="d-flex justify-content-between mb-2" style={bodyText}>
              <span>Username</span>
              <strong>{scanResult.user?.username || scanResult.user?.name || "—"}</strong>
            </div>
            <div className="d-flex justify-content-between mb-2" style={bodyText}>
              <span>Status</span>
              <strong>{normalizeScanStatus(scanResult.attendance)}</strong>
            </div>
          </div>

          {scanResult.planRemindersLoading && (
            <div className="small mt-3" style={mutedText} role="status" aria-live="polite">
              Checking active plan expiry dates...
            </div>
          )}

          {!scanResult.planRemindersLoading && scanResult.planReminders?.length > 0 && (
            <div className="mt-3" aria-live="polite">
              <div className="d-flex align-items-center gap-2 mb-2" style={bodyText}>
                <i className="bi bi-bell-fill text-warning" aria-hidden="true"></i>
                <strong>Active Plan Expiry Reminder</strong>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {scanResult.planReminders.map((plan) => (
                  <div
                    key={`${plan.type}-${plan.name}-${plan.endDate}`}
                    className="border border-warning rounded px-3 py-2 flex-grow-1"
                    style={{ minWidth: 210, background: "rgba(255,193,7,0.08)" }}
                  >
                    <div className="small text-warning fw-semibold">{plan.type}</div>
                    <div className="fw-semibold text-white">{plan.name}</div>
                    <div className="small" style={bodyText}>
                      Expires: <strong>{formatDateDDMMYYYY(plan.endDate, "-")}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-outline-light mt-3" onClick={resetScanPanel}>
            Reset Scan Panel
          </button>
        </div>
      )}

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Tabs */}
      <ul className="nav nav-underline mb-3">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === "records" ? "active" : ""}`} onClick={() => setActiveTab("records")}>
            Attendance Records
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === "checked" ? "active" : ""}`} onClick={() => setActiveTab("checked")}>
            Checked-in Users
          </button>
        </li>
      </ul>
      
      {activeTab === "checked" && (
        <div>
          <div className="d-flex align-items-start justify-content-between mb-3">
            <div>
              <h5 className="mb-1" style={titleText}>
                Checked-in Users
              </h5>
              <div style={mutedText}>Monitor active check-ins.</div>
            </div>

            <button
              className="btn btn-outline-light"
              onClick={() => {
                loadCheckedIn(true);
                loadActiveCheckins(false);
              }}
              disabled={checkedLoading || activeCheckinsLoading}
            >
              {checkedLoading || activeCheckinsLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div className="card mb-3" style={cardGlass}>
            <div className="card-body">
              <span className="badge rounded-pill text-bg-light me-2">
                Total members: <b>{memberCountLoading ? "..." : checkedSummary.total_members}</b>
              </span>
              <span className="badge rounded-pill text-bg-light me-2">
                Active check-ins: <b>{activeCheckinsLoading ? "..." : checkedSummary.active_checkins}</b>
              </span>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-dark table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Last Scan</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {checkedUsers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-muted py-4">
                      {checkedLoading ? "Loading..." : "No active check-ins."}
                    </td>
                  </tr>
                ) : (
                  checkedUsers.map((u) => (
                    <tr key={u.userId || `${u.name}-${u.scannedAt}`}>
                      <td>{u.name || "-"}</td>
                      <td>{roleBadge(u.role)}</td>
                      <td>{formatDateTimeVideoStyle(u.scannedAt)}</td>
                      <td>
                        <span className="badge bg-success">Active</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= RECORDS TAB ================= */}
      {activeTab === "records" && (
        <div>
          <div className="d-flex align-items-start justify-content-between mb-3">
            <div>
              <h5 className="mb-1" style={titleText}>
                Attendance Records
              </h5>
              <div style={mutedText}>All RFID scan records recorded for members.</div>
            </div>

            <button className="btn btn-outline-light" onClick={() => loadRecords(true)} disabled={recordsLoading}>
              {recordsLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {/* Filters */}
          <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
            <div style={{ minWidth: 220 }}>
              <label className="form-label mb-1" style={bodyText}>
                Search Name
              </label>
              <input
                type="text"
                className="form-control admin-search-input"
                placeholder="e.g. john"
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
              />
            </div>

            <div style={{ minWidth: 220 }}>
              <label className="form-label mb-1" style={bodyText}>
                Start Date
              </label>
              <input
                type="date"
                className="form-control admin-search-input"
                value={recordStartDateFilter}
                onChange={(e) => setRecordStartDateFilter(e.target.value)}
              />
            </div>


            <div style={{ minWidth: 220 }}>
              <label className="form-label mb-1" style={bodyText}>
                End Date
              </label>
              <input
                type="date"
                className="form-control admin-search-input"
                value={recordEndDateFilter}
                min={recordStartDateFilter || undefined}
                onChange={(e) => setRecordEndDateFilter(e.target.value)}
              />
            </div>
            <button
              className="btn btn-outline-light"
              onClick={() => {
                setRecordSearch("");
                setRecordStartDateFilter("");
                setRecordEndDateFilter("");
              }}
            >
              Clear Filters
            </button>

            <div className="ms-auto text-muted">
              Showing <b>{filteredRecords.length}</b> record(s)
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-dark table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Scan Type</th>
                  <th>Scan Time</th>
                  <th>Total Days</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center text-muted py-4">
                      {recordsLoading ? "Loading..." : "No attendance records found."}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, idx) => {
                    const name = r.name || r.user_name || r.username || "-";
                    const role = r.role || r.user_role || "-";
                    const type = normalizeRecordType(r);
                    const scannedAt = r.scanned_at || r.created_at || r.time || r.timestamp;
                    const recordKey = getRecordUserKey({ ...r, name, role }, `${name}-${role}`);
                    const totalDays = recordDayCounts.get(recordKey) ?? 0;

                    return (
                      <tr key={r.id || `${idx}-${name}-${scannedAt}`}>
                        <td>{name}</td>
                        <td>{roleBadge(role)}</td>
                        <td>
                          {type === "check_in" ? (
                            <span className="badge bg-success">Check In</span>
                          ) : type === "check_out" ? (
                            <span className="badge bg-secondary">Check Out</span>
                          ) : (
                            <span className="badge bg-dark">{type || "-"}</span>
                          )}
                        </td>
                        <td>{formatDateTimeVideoStyle(scannedAt)}</td>
                        <td>{totalDays}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
