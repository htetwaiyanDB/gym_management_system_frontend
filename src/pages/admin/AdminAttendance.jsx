import React, { useEffect, useMemo, useRef, useState } from "react";
import axiosClient from "../../api/axiosClient";
import {
  ATTENDANCE_SCAN_CONTROL_STORAGE_KEY,
  getAttendanceScanControlStatus,
  saveAttendanceScanControlLocal,
  scanMemberCardAttendance,
  setAttendanceScanControlStatus,
} from "../../api/attendanceApi";
import { isCardNotRegisteredError, normalizeCardId } from "../../utils/rfid";

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
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function normalizeRole(role) {
  const r = String(role || "").toLowerCase();
  if (r === "trainer") return "Trainer";
  if (r === "user") return "User";
  if (r === "admin" || r === "administrator") return "Admin";
  return role || "-";
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
  background: "rgba(0,0,0,0.38)",
  border: "1px solid rgba(255,255,255,0.14)",
  boxShadow: "0 10px 35px rgba(0,0,0,0.35)",
};

const titleText = { color: "rgba(255,255,255,0.92)" };
const bodyText = { color: "rgba(255,255,255,0.80)" };
const mutedText = { color: "rgba(255,255,255,0.60)" };

const glassSelectStyle = {
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.18)",
};

export default function AdminAttendance() {
  const [activeTab, setActiveTab] = useState("records"); // records | checked
  const [msg, setMsg] = useState(null);
  const scanInputRef = useRef(null);
  const scanTimeoutRef = useRef(null);

  // Records
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [recordRoleFilter, setRecordRoleFilter] = useState("all");
  const [recordTypeFilter, setRecordTypeFilter] = useState("all");
  const [recordSearch, setRecordSearch] = useState("");
  const [recordStartDateFilter, setRecordStartDateFilter] = useState("");
  const [recordEndDateFilter, setRecordEndDateFilter] = useState("");

  // Member card scan panel
  const [scanValue, setScanValue] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanControlSyncing, setScanControlSyncing] = useState(false);

  // Checked-in
  const [checkedLoading, setCheckedLoading] = useState(false);
  const [checkedSummary, setCheckedSummary] = useState({ total_members: 0, active_checkins: 0 });
  const [checkedUsers, setCheckedUsers] = useState([]);
  const [activeCheckinsLoading, setActiveCheckinsLoading] = useState(false);
  const [memberCountLoading, setMemberCountLoading] = useState(false);

  const showError = (text) => {
    setMsg({ type: "danger", text });
  };

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
    let alive = true;

    const loadScanControl = async () => {
      try {
        const res = await getAttendanceScanControlStatus();
        if (!alive) return;
        setScannerActive(!!res?.isActive);
      } catch {
        if (!alive) return;
      }
    };

    loadScanControl();

    const intervalId = window.setInterval(loadScanControl, 10000);

    const onStorage = (event) => {
      if (event.key !== ATTENDANCE_SCAN_CONTROL_STORAGE_KEY) return;
      try {
        const next = event.newValue ? JSON.parse(event.newValue) : null;
        setScannerActive(!!next?.isActive);
      } catch {
        setScannerActive(false);
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

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
    const roleF = String(recordRoleFilter).toLowerCase();
    const typeF = String(recordTypeFilter).toLowerCase();
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
      const roleRaw = String(r?.role || r?.user_role || "").trim();
      const role = roleRaw.toLowerCase();
      const type = normalizeRecordType(r);
      const scannedAt = r?.scanned_at || r?.created_at || r?.time || r?.timestamp;
      const dayKey = getRecordDayKey(scannedAt);

      if (roleF !== "all" && role !== roleF) return false;
      if (typeF !== "all" && type !== typeF) return false;
      if (startDateF && (!dayKey || dayKey < startDateF)) return false;
      if (endDateF && (!dayKey || dayKey > endDateF)) return false;

      if (search) {
        const haystack = `${name} ${roleRaw}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });
  }, [records, recordRoleFilter, recordTypeFilter, recordSearch, recordStartDateFilter, recordEndDateFilter]);

  const recordDayCounts = useMemo(() => {
    const datesByUser = new Map();
    const list = Array.isArray(records) ? records : [];

    list.forEach((record) => {
      const name = record?.name || record?.user_name || record?.username || "-";
      const role = record?.role || record?.user_role || "-";
      const key = getRecordUserKey({ ...record, name, role }, `${name}-${role}`);
      const scannedAt = record?.scanned_at || record?.created_at || record?.time || record?.timestamp;
      const dayKey = getRecordDayKey(scannedAt);
      if (!key || !dayKey) return;

      if (!datesByUser.has(key)) {
        datesByUser.set(key, new Set());
      }
      datesByUser.get(key).add(dayKey);
    });

    const counts = new Map();
    datesByUser.forEach((set, key) => counts.set(key, set.size));
    return counts;
  }, [records]);

  const handleScanSubmit = async (rawValue) => {
    if (!scannerActive || scanLoading || scanResult) return;
    const cardId = normalizeCardId(rawValue);
    if (!cardId) {
      setScanError("Please scan a valid member card.");
      return;
    }

    setScanLoading(true);
    setScanError(null);

    try {
      const res = await scanMemberCardAttendance(cardId);
      const payload = res?.data ?? {};
      const { user, attendance, message } = extractScanPayload(payload);

      setScanResult({
        user,
        attendance,
        message: message || "Scan recorded successfully.",
      });
      await Promise.all([loadRecords(false), loadCheckedIn(false), loadActiveCheckins(false), loadMemberCount(false)]);
      setScanValue(cardId);
    } catch (e) {
      const message = e?.response?.data?.message || "Unable to scan member card.";
      if (isCardNotRegisteredError(message)) {
        setScanError("This card is not registered. Please register the member card first.");
      } else {
        setScanError(message);
      }
    } finally {
      setScanLoading(false);
    }
  };

  const handleScanChange = (event) => {
    if (!scannerActive) return;
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
    setScanLoading(false);
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
          Track attendance by RFID scan and monitor active gym users.
        </div>
      </div>

      {!scanResult && (
        <div className="mb-4" style={{ ...cardGlass, borderRadius: 16, padding: 18 }}>
          <div className="d-flex align-items-start justify-content-between mb-2">
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
                Member Card Scan
              </div>
              <div style={{ fontSize: 13, ...mutedText }}>
                Admin can start/stop scanner control for member attendance.
              </div>
            </div>
            <span className={`badge ${scanLoading ? "bg-warning text-dark" : "bg-success"}`}>
              {scanControlSyncing ? "Syncing..." : scanLoading ? "Scanning..." : scannerActive ? "Scanner ON" : "Scanner OFF"}
            </span>
          </div>

          <div className="d-flex gap-2 mb-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              onClick={async () => {
                setScanControlSyncing(true);
                try {
                  const res = await setAttendanceScanControlStatus(true);
                  setScannerActive(!!res?.isActive);
                  saveAttendanceScanControlLocal(!!res?.isActive);
                  setScanError(null);
                  setScanResult(null);
                  setTimeout(() => scanInputRef.current?.focus(), 0);
                } catch (e) {
                  setScanError(e?.response?.data?.message || "Failed to start scanner control.");
                } finally {
                  setScanControlSyncing(false);
                }
              }}
              disabled={scannerActive || scanLoading || scanControlSyncing}
            >
              Start Scan
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              onClick={async () => {
                setScanControlSyncing(true);
                try {
                  const res = await setAttendanceScanControlStatus(false);
                  setScannerActive(!!res?.isActive);
                  saveAttendanceScanControlLocal(!!res?.isActive);
                  setScanValue("");
                  setScanError(null);
                } catch (e) {
                  setScanError(e?.response?.data?.message || "Failed to stop scanner control.");
                } finally {
                  setScanControlSyncing(false);
                }
              }}
              disabled={!scannerActive || scanControlSyncing}
            >
              Stop Scan
            </button>
          </div>

          <input
            ref={scanInputRef}
            type="text"
            className="form-control"
            value={scanValue}
            onChange={handleScanChange}
            onKeyDown={handleScanKeyDown}
            placeholder={scannerActive ? "Scan member card ID" : "Click Start Scan to enable reader"}
            autoComplete="off"
            disabled={!scannerActive || scanLoading}
          />

          {scanError && (
            <div className="alert alert-danger mt-3 mb-0" role="alert">
              {scanError}
            </div>
          )}
        </div>
      )}

      {scanResult && (
        <div className="mb-4" style={{ ...cardGlass, borderRadius: 16, padding: 18 }}>
          <div className="d-flex align-items-start justify-content-between">
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
                Latest Scan Result
              </div>
              <div style={{ fontSize: 13, ...mutedText }}>Scan panel locked to prevent duplicates.</div>
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
              <span>Username</span>
              <strong>{scanResult.user?.username || scanResult.user?.name || "—"}</strong>
            </div>
            <div className="d-flex justify-content-between mb-2" style={bodyText}>
              <span>Role</span>
              <strong>{normalizeRole(scanResult.user?.role || scanResult.attendance?.role)}</strong>
            </div>
            <div className="d-flex justify-content-between mb-2" style={bodyText}>
              <span>Member Name</span>
              <strong>
                {scanResult.user?.name ||
                  scanResult.user?.full_name ||
                  [scanResult.user?.first_name, scanResult.user?.last_name].filter(Boolean).join(" ") ||
                  "—"}
              </strong>
            </div>
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
              <span>Status</span>
              <strong>{normalizeScanStatus(scanResult.attendance)}</strong>
            </div>
            <div className="d-flex justify-content-between" style={bodyText}>
              <span>Time</span>
              <strong>
                {formatDateTimeVideoStyle(
                  scanResult.attendance?.scanned_at ||
                    scanResult.attendance?.created_at ||
                    scanResult.attendance?.timestamp ||
                    scanResult.attendance?.time
                )}
              </strong>
            </div>
          </div>

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
            <div style={{ minWidth: 200 }}>
              <label className="form-label mb-1" style={bodyText}>
                Role
              </label>
              <select className="form-select" style={glassSelectStyle} value={recordRoleFilter} onChange={(e) => setRecordRoleFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="user">User</option>
                <option value="trainer">Trainer</option>
              </select>
            </div>

            <div style={{ minWidth: 220 }}>
              <label className="form-label mb-1" style={bodyText}>
                Search Name / Role
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. john, trainer"
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
                className="form-control"
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
                className="form-control"
                value={recordEndDateFilter}
                min={recordStartDateFilter || undefined}
                onChange={(e) => setRecordEndDateFilter(e.target.value)}
              />
            </div>

            <div style={{ minWidth: 220 }}>
              <label className="form-label mb-1" style={bodyText}>
                Scan Type
              </label>
              <select className="form-select" style={glassSelectStyle} value={recordTypeFilter} onChange={(e) => setRecordTypeFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="check_in">Check In</option>
                <option value="check_out">Check Out</option>
              </select>
            </div>

            <button
              className="btn btn-outline-light"
              onClick={() => {
                setRecordRoleFilter("all");
                setRecordTypeFilter("all");
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
