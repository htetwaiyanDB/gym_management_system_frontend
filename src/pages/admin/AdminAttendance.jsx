import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import axiosClient from "../../api/axiosClient";

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
 * Backend returns scan URLs only:
 * { user_qr: "...", trainer_qr: "..." }
 * Generate QR codes on frontend from those URLs.
 */
function renderQrFromUrl(url, id) {
  if (!url) return null;
  return (
    <div
      id={id}
      style={{
        background: "#fff",
        padding: 12,
        borderRadius: 12,
        width: 240,
        margin: "0 auto",
      }}
    >
      <QRCodeCanvas value={url} size={216} level="H" includeMargin={false} />
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState("qr"); // records | qr | checked
  const [msg, setMsg] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  // Records
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [recordRoleFilter, setRecordRoleFilter] = useState("all");
  const [recordTypeFilter, setRecordTypeFilter] = useState("all");

  // QR (backend provides links only)
  const [qrLoading, setQrLoading] = useState(false);
  const [qrLinks, setQrLinks] = useState({
    user_qr: null,
    trainer_qr: null,
  });

  // Override form
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideUsers, setOverrideUsers] = useState([]);
  const [overrideQrType, setOverrideQrType] = useState("user"); // user | trainer
  const [overrideUserId, setOverrideUserId] = useState("");

  // Checked-in
  const [checkedLoading, setCheckedLoading] = useState(false);
  const [checkedSummary, setCheckedSummary] = useState({ total_members: 0, active_checkins: 0 });
  const [checkedUsers, setCheckedUsers] = useState([]);
  const [activeCheckinsLoading, setActiveCheckinsLoading] = useState(false);

  // small helper: show success and optionally auto-hide
  const showSuccess = (text) => {
    setMsg({ type: "success", text });
    // auto-hide after 3 seconds (optional)
    window.clearTimeout(showSuccess._t);
    showSuccess._t = window.setTimeout(() => setMsg(null), 3000);
  };

  const showError = (text) => {
    setMsg({ type: "danger", text });
  };

    const printQr = (wrapperId, title, url) => { 
    const wrapper = document.getElementById(wrapperId);
    const canvas = wrapper?.querySelector("canvas");

    if (!canvas) {
      showError("QR code is not ready to print. Please refresh and try again.");
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      showError("Pop-up blocked. Please allow pop-ups to print the QR code.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            @page { size: A4; margin: 24mm; }
            body { font-family: Arial, sans-serif; color: #111; }
            .page { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
            .qr { width: 320px; height: 320px; object-fit: contain; margin: 24px 0; }
            .subtitle { color: #444; font-size: 14px; text-align: center; word-break: break-all; }
            h1 { font-size: 24px; margin-bottom: 8px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="page">
            <h1>${title}</h1>
             <img id="qr-image" class="qr" src="${dataUrl}" alt="${title}" />
            <div class="subtitle">${url || ""}</div>
          </div>
          <script>
            const img = document.getElementById("qr-image");
            const triggerPrint = () => {
              setTimeout(() => {
                window.focus();
                window.print();
                window.close();
              }, 250);
            };
            if (!img) {
              triggerPrint();
            } else if (img.complete) {
              triggerPrint();
            } else {
              img.onload = triggerPrint;
              img.onerror = triggerPrint;
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };


  // ---------------- API calls ----------------

  const loadQr = async () => {
    setQrLoading(true);
    try {
      const res = await axiosClient.get("/attendance/qr");
      const d = res.data || {};
      setQrLinks({
        user_qr: d.user_qr || null,
        trainer_qr: d.trainer_qr || null,
      });
    } catch (e) {
      showError(e?.response?.data?.message || "Failed to load QR codes.");
    } finally {
      setQrLoading(false);
    }
  };

  const refreshQr = async () => {
    setBusyKey("refreshQr");
    try {
      await axiosClient.post("/attendance/qr/refresh");
      await loadQr();
      showSuccess("QR codes refreshed successfully.");
    } catch (e) {
      showError(e?.response?.data?.message || "Failed to refresh QR codes.");
    } finally {
      setBusyKey(null);
    }
  };

  const loadOverrideUsers = async () => {
    setOverrideLoading(true);
    try {
      const res = await axiosClient.get("/attendance/users");
      const list = res.data?.users || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setOverrideUsers(Array.isArray(list) ? list : []);
    } catch {
      setOverrideUsers([]);
    } finally {
      setOverrideLoading(false);
    }
  };

  const recordOverrideScan = async () => {
    if (!overrideUserId) {
      showError("Please select a user.");
      return;
    }

    setBusyKey("recordScan");
    try {
      // ✅ FIX: backend expects qr_type not type
      const payload = { qr_type: overrideQrType, user_id: Number(overrideUserId) };
      const res = await axiosClient.post("/attendance/scan", payload);

      showSuccess(res?.data?.message || "Scan recorded successfully.");

      // ✅ refresh tables but DO NOT clear msg inside loaders
      await Promise.all([loadRecords(false), loadCheckedIn(false), loadActiveCheckins(false)]);
    } catch (e) {
      showError(e?.response?.data?.message || "Failed to record scan.");
    } finally {
      setBusyKey(null);
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
        total_members: uniqueKeys.size,
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
    loadQr();
    loadOverrideUsers();
  }, []);

  useEffect(() => {
    if (activeTab === "records") loadRecords(true);
    if (activeTab === "checked") {
      loadCheckedIn(true);
      loadActiveCheckins(false);
    }
    if (activeTab === "qr") {
      loadQr();
      loadOverrideUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "checked") return undefined;
    const intervalId = window.setInterval(() => {
      loadCheckedIn(false);
      loadActiveCheckins(false);
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [activeTab]);

  // ---------------- computed ----------------

  const filteredOverrideUsers = useMemo(() => {
    const t = String(overrideQrType).toLowerCase();
    return (overrideUsers || []).filter((u) => String(u?.role || "").toLowerCase() === t);
  }, [overrideUsers, overrideQrType]);

  const filteredRecords = useMemo(() => {
    const roleF = String(recordRoleFilter).toLowerCase();
    const typeF = String(recordTypeFilter).toLowerCase();

    const list = Array.isArray(records) ? [...records] : [];

    // newest first
    list.sort((a, b) => {
      const ta = parseBackendDateTime(a?.scanned_at || a?.created_at)?.getTime() ?? 0;
      const tb = parseBackendDateTime(b?.scanned_at || b?.created_at)?.getTime() ?? 0;
      return tb - ta;
    });

    return list.filter((r) => {
      const role = String(r?.role || r?.user_role || "").toLowerCase();
      const type = normalizeRecordType(r);

      if (roleF !== "all" && role !== roleF) return false;
      if (typeF !== "all" && type !== typeF) return false;
      return true;
    });
  }, [records, recordRoleFilter, recordTypeFilter]);

  // ---------------- render ----------------

  return (
    <div className="admin-card p-4">
      <div className="mb-3">
        <h4 className="mb-1" style={titleText}>
          Attendance Center
        </h4>
        <div className="admin-muted" style={mutedText}>
          Track trainer attendance, scan QR codes, and monitor active gym users.
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Tabs */}
      <ul className="nav nav-underline mb-3">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === "records" ? "active" : ""}`} onClick={() => setActiveTab("records")}>
            Attendance Records
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === "qr" ? "active" : ""}`} onClick={() => setActiveTab("qr")}>
            QR Codes
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === "checked" ? "active" : ""}`} onClick={() => setActiveTab("checked")}>
            Checked-in Users
          </button>
        </li>
      </ul>

      {/* ================= QR TAB ================= */}
      {activeTab === "qr" && (
        <div>
          <div className="d-flex align-items-start justify-content-between mb-3">
            <div>
              <h5 className="mb-1" style={titleText}>
                Gym QR Codes
              </h5>
              <div className="admin-muted" style={mutedText}>
                Share these codes for members and trainers to scan on entry or exit.
              </div>
            </div>

            <button className="btn btn-dark" onClick={refreshQr} disabled={qrLoading || busyKey === "refreshQr"}>
              {busyKey === "refreshQr" ? "Refreshing..." : "Refresh QR Codes"}
            </button>
          </div>

          <div className="row g-3 mb-4">
            {/* Member */}
            <div className="col-12 col-lg-6">
              <div className="card h-100" style={cardGlass}>
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <h6 className="mb-0" style={titleText}>
                      Member QR Code
                    </h6>
                    <button
                      className="btn btn-sm btn-outline-light"
                      onClick={() => printQr("member-qr-code", "Member QR Code", qrLinks.user_qr)}
                      disabled={qrLoading || !qrLinks.user_qr}
                    >
                      Print QR
                    </button>
                  </div>
                  <div className="mb-3" style={mutedText}>
                    Members scan this QR to check in and check out each day.
                  </div>

                  {qrLoading ? (
                    <div style={mutedText}>Loading...</div>
                  ) : (
                    <>
+                     {renderQrFromUrl(qrLinks.user_qr, "member-qr-code")}
                      <div className="small mt-3" style={bodyText}>
                        <div>
                          <b>Scan link:</b> <span style={mutedText}>{qrLinks.user_qr || "-"}</span>
                        </div>
                        <div style={mutedText}>Scan twice daily (in/out) to record attendance.</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Trainer */}
            <div className="col-12 col-lg-6">
              <div className="card h-100" style={cardGlass}>
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <h6 className="mb-0" style={titleText}>
                      Trainer QR Code
                    </h6>
                    <button
                      className="btn btn-sm btn-outline-light"
                      onClick={() => printQr("trainer-qr-code", "Trainer QR Code", qrLinks.trainer_qr)}
                      disabled={qrLoading || !qrLinks.trainer_qr}
                    >
                      Print QR
                    </button>
                  </div>
                  <div className="mb-3" style={mutedText}>
                    Trainers scan this QR for working day tracking and payroll.
                  </div>

                  {qrLoading ? (
                    <div style={mutedText}>Loading...</div>
                  ) : (
                    <>
                      {renderQrFromUrl(qrLinks.trainer_qr, "trainer-qr-code")}
                      <div className="small mt-3" style={bodyText}>
                        <div>
                          <b>Scan link:</b> <span style={mutedText}>{qrLinks.trainer_qr || "-"}</span>
                        </div>
                        <div style={mutedText}>A working day is counted when two scans are recorded.</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Admin Scan Override */}
          <div className="card" style={cardGlass}>
            <div className="card-body">
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className="badge bg-warning text-dark">Admin</span>
                <h6 className="mb-0" style={titleText}>
                  Scan Override
                </h6>
              </div>

              <div className="small mb-3" style={mutedText}>
                Use this form only if someone cannot scan the QR. It will record a scan automatically.
              </div>

              <div className="row g-3 align-items-end">
                <div className="col-12 col-md-4">
                  <label className="form-label fw-bold" style={bodyText}>
                   Select QR Type
                  </label>
                  <select
                    className="form-select bg-dark"
                    style={glassSelectStyle}
                    value={overrideQrType}
                    onChange={(e) => {
                      setOverrideQrType(e.target.value);
                      setOverrideUserId("");
                    }}
                    disabled={overrideLoading}
                  >
                    <option value="user" className="fw-bold text-light">Member</option>
                    <option value="trainer" className="fw-bold text-light">Trainer</option>
                  </select>
                </div>

                <div className="col-12 col-md-5">
                  <label className="form-label fw-bold" style={bodyText}>
                    User
                  </label>
                  <select
                    className="form-select bg-dark"
                    style={glassSelectStyle}
                    value={overrideUserId}
                    onChange={(e) => setOverrideUserId(e.target.value)}
                    disabled={overrideLoading}
                  >
                    <option value="" className="fw-bold text-light">{overrideLoading ? "Loading users..." : "Select user"}</option>
                    {filteredOverrideUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({normalizeRole(u.role)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12 col-md-3">
                  <button className="btn btn-success w-100" onClick={recordOverrideScan} disabled={busyKey === "recordScan"}>
                    {busyKey === "recordScan" ? "Recording..." : "Record Scan"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      
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
                Total members: <b>{checkedSummary.total_members}</b>
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
              <div style={mutedText}>All scans recorded by QR or admin override.</div>
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
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-muted py-4">
                      {recordsLoading ? "Loading..." : "No attendance records found."}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, idx) => {
                    const name = r.name || r.user_name || r.username || "-";
                    const role = r.role || r.user_role || "-";
                    const type = normalizeRecordType(r);
                    const scannedAt = r.scanned_at || r.created_at || r.time || r.timestamp;

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
