// UserAttendance.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axiosClient from "../../api/axiosClient";
import {
  ATTENDANCE_SCAN_CONTROL_STORAGE_KEY,
  getAttendanceScanControlStatus,
  scanRfidAttendance,
} from "../../api/attendanceApi";
import RfidInputListener from "../../components/RfidInputListener";
import QrScanner from "../common/QrScanner";
import { isCardNotRegisteredError, normalizeCardId } from "../../utils/rfid";
import { parseTokenFromQrText } from "../../utils/qr";
import { useNavigate } from "react-router-dom";

/**
 * Your backend GET /api/user/check-in returns:
 *  {
 *    latest_scan: { action: "check_in|check_out", timestamp: "ISO" },
 *    recent_scans: [{ action, timestamp }, ... newest -> oldest]
 *  }
 *
 * Your backend POST /api/user/check-in/scan returns:
 *  { message: "...", record: { action, timestamp } }
 */

/* ---------------------------
   Date helpers (robust)
--------------------------- */
function parseBackendDateTime(v) {
  if (!v) return null;
  const raw = String(v).trim();
  // supports "YYYY-MM-DD HH:mm:ss" too, if ever returned
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(v) {
  const d = parseBackendDateTime(v);
  if (!d) return false;
  return isSameDay(d, new Date());
}

function formatTime(v) {
  const d = parseBackendDateTime(v);
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ---------------------------
   Action/timestamp helpers
--------------------------- */
function normalizeAction(a) {
  if (!a) return null;
  return String(a).toLowerCase().replace("-", "_");
}

function getAction(obj) {
  return normalizeAction(obj?.action ?? obj?.type ?? obj?.status ?? obj?.event ?? null);
}

function getTimestamp(obj) {
  return obj?.timestamp ?? obj?.time ?? obj?.scanned_at ?? obj?.created_at ?? null;
}

/* ---------------------------
   Cache (so refresh won’t lose)
--------------------------- */
const STORAGE_KEY = "user_attendance_cache_v2";

function loadCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Keep only if cached for today (based on cachedAt)
    if (!isToday(data?.cachedAt)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache({ latest, checkInTime, checkOutTime }) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        latest,
        checkInTime,
        checkOutTime,
      })
    );
  } catch {
    // ignore
  }
}

function clearCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function UserAttendance() {
  const isMobile = useMemo(() => window.innerWidth < 768, []);
  const busyRef = useRef(false);
  const nav = useNavigate();

  const [scannerActive, setScannerActive] = useState(true);
  const [scanAllowedByAdmin, setScanAllowedByAdmin] = useState(true);

  const [statusMsg, setStatusMsg] = useState(null);
  const [rfidWarning, setRfidWarning] = useState(false);
  const [pendingCardId, setPendingCardId] = useState("");
  const [latest, setLatest] = useState(null);
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);

  const nextAction = useMemo(() => {
    const a = getAction(latest);
    return a === "check_in" ? "check_out" : "check_in";
  }, [latest]);

  // 1) Load cache immediately (fast UI after refresh)
  useEffect(() => {
    const cached = loadCache();
    if (!cached) return;

    setLatest(cached.latest ?? null);
    setCheckInTime(cached.checkInTime ?? null);
    setCheckOutTime(cached.checkOutTime ?? null);
  }, []);

  // 2) Load from backend (source of truth)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await axiosClient.get("/user/check-in");
        const payload = res?.data || {};

        const latestScan = payload?.latest_scan ?? null;
        const scans = Array.isArray(payload?.recent_scans) ? payload.recent_scans : [];

        // newest -> oldest, so find() gives latest matching action
        const lastIn = scans.find((s) => getAction(s) === "check_in")?.timestamp || null;
        const lastOut = scans.find((s) => getAction(s) === "check_out")?.timestamp || null;

        if (!alive) return;

        const latestTs = getTimestamp(latestScan);
        const latestOk = latestTs && isToday(latestTs);
        const inOk = lastIn && isToday(lastIn);
        const outOk = lastOut && isToday(lastOut);

        // Set only if it is today; otherwise clear
        const nextLatest = latestOk ? latestScan : null;
        const nextIn = inOk ? lastIn : null;
        const nextOut = outOk ? lastOut : null;

        setLatest(nextLatest);
        setCheckInTime(nextIn);
        setCheckOutTime(nextOut);

        // Keep cache synced
        if (nextLatest || nextIn || nextOut) {
          saveCache({ latest: nextLatest, checkInTime: nextIn, checkOutTime: nextOut });
        } else {
          clearCache();
        }
      } catch (e) {
        if (!alive) return;
        setStatusMsg({
          type: "warning",
          text: e?.response?.data?.message || "Unable to load attendance status.",
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadScanControl = async () => {
      const res = await getAttendanceScanControlStatus();
      if (!alive) return;
      setScanAllowedByAdmin(!!res?.isActive);
    };

    loadScanControl();
    const intervalId = window.setInterval(loadScanControl, 10000);

    const onStorage = (event) => {
      if (event.key !== ATTENDANCE_SCAN_CONTROL_STORAGE_KEY) return;
      try {
        const next = event.newValue ? JSON.parse(event.newValue) : null;
        setScanAllowedByAdmin(!!next?.isActive);
      } catch {
        setScanAllowedByAdmin(true);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const effectiveScannerActive = scannerActive && scanAllowedByAdmin;

  const handleRfidScan = async (rawCardId) => {
    if (!scanAllowedByAdmin) {
      setStatusMsg({ type: "warning", text: "Scanner is stopped by admin." });
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;

    setStatusMsg(null);
    setRfidWarning(false);

    const cardId = normalizeCardId(rawCardId);
    if (!cardId) {
      setStatusMsg({ type: "danger", text: "Invalid RFID card ID." });
      busyRef.current = false;
      return;
    }

    try {
      // prevent double scan while request is running
      setScannerActive(false);

      const res = await scanRfidAttendance(cardId);

      const record = res?.data?.record ?? res?.data ?? null;
      const action = getAction(record);
      const timestamp = getTimestamp(record);

      if (!timestamp || !isToday(timestamp)) {
        setStatusMsg({
          type: "warning",
          text: res?.data?.message || "Recorded, but timestamp is not today.",
        });
        // allow scanning again
        setScannerActive(true);
        return;
      }

      setLatest(record);

      if (action === "check_in") {
        setCheckInTime(timestamp);
        setCheckOutTime(null);
        setStatusMsg({ type: "success", text: "Checked in successfully" });

        saveCache({ latest: record, checkInTime: timestamp, checkOutTime: null });
        setScannerActive(true);
      } else if (action === "check_out") {
        setCheckOutTime(timestamp);
        setStatusMsg({ type: "success", text: "Checked out successfully" });

        saveCache({ latest: record, checkInTime, checkOutTime: timestamp });

        // optional: stop after check-out; if you want keep scanning, change to true
        setScannerActive(false);
      } else {
        // unknown action, still store latest
        setStatusMsg({ type: "success", text: res?.data?.message || "Recorded." });
        saveCache({ latest: record, checkInTime, checkOutTime });
        setScannerActive(true);
      }
    } catch (e) {
      const message = e?.response?.data?.message || "Scan failed.";
      if (isCardNotRegisteredError(message)) {
        setPendingCardId(cardId);
        localStorage.setItem("rfid_pending_card_id", cardId);
        setRfidWarning(true);
        setScannerActive(false);
        const user = JSON.parse(localStorage.getItem("user") || "null");
        if (String(user?.role || "").toLowerCase() === "administrator") {
          nav("/admin/attendance/rfid-register");
        }
      } else {
        setStatusMsg({
          type: "danger",
          text: message,
        });
        setScannerActive(true);
      }
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 700);
    }
  };

  const handleQrScan = async (decodedText) => {
    if (!scanAllowedByAdmin) {
      setStatusMsg({ type: "warning", text: "Scanner is stopped by admin." });
      return;
    }
    const parsed = parseTokenFromQrText(decodedText);
    if (!parsed?.token) {
      setStatusMsg({ type: "danger", text: "Invalid QR code format." });
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setStatusMsg(null);
    setRfidWarning(false);
    try {
      setScannerActive(false);
      const res = await axiosClient.post("/user/check-in/scan", {
        token: parsed.token,
      });
      const record = res?.data?.record ?? null;
      const action = getAction(record);
      const timestamp = getTimestamp(record);

      if (!timestamp || !isToday(timestamp)) {
        setStatusMsg({
          type: "warning",
          text: res?.data?.message || "Recorded, but timestamp is not today.",
        });
        setScannerActive(true);
        return;
      }

      setLatest(record);

      if (action === "check_in") {
        setCheckInTime(timestamp);
        setCheckOutTime(null);
        setStatusMsg({ type: "success", text: res?.data?.message || "Check-in recorded." });

        saveCache({ latest: record, checkInTime: timestamp, checkOutTime: null });
        setScannerActive(true);
      } else if (action === "check_out") {
        setCheckOutTime(timestamp);
        setStatusMsg({ type: "success", text: res?.data?.message || "Check-out recorded." });

        saveCache({ latest: record, checkInTime, checkOutTime: timestamp });

        setScannerActive(false);
      } else {
        setStatusMsg({ type: "success", text: res?.data?.message || "Recorded." });
        saveCache({ latest: record, checkInTime, checkOutTime });
        setScannerActive(true);
      }
    } catch (e) {
      setStatusMsg({
        type: "danger",
        text: e?.response?.data?.message || "Scan failed.",
      });
      setScannerActive(true);
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 700);
    }
  };

  if (!isMobile) {
    return (
      <div className="container py-3" style={{ maxWidth: 520 }}>
        <h4 className="mb-2">User Attendance</h4>
        <div className="alert alert-warning mb-0">
          Attendance scanning works on mobile view only.
        </div>
      </div>
    );
  }

  return (
    <div className="container py-3" style={{ maxWidth: 520 }}>
      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: 14,
          color: "rgba(255,255,255,0.92)",
          marginBottom: 12,
        }}
      >
        <div className="d-flex align-items-start justify-content-between">
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>User Attendance</div>
            <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>
              Scan once to <b>Check-in</b>, scan again to <b>Check-out</b>.
            </div>
          </div>

          <div className="text-end">
            <span className={`badge ${effectiveScannerActive ? "bg-success" : "bg-secondary"}`}>
              {effectiveScannerActive ? "Scanner ON" : "Scanner OFF"}
            </span>
          </div>
        </div>

        <div className="d-flex justify-content-between mt-3">
          <div style={{ opacity: 0.9 }}>
            Next action: <b>{nextAction === "check_in" ? "CHECK-IN" : "CHECK-OUT"}</b>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className={`alert alert-${statusMsg.type}`} style={{ fontWeight: 600 }}>
          {statusMsg.text}
        </div>
      )}

      {!scanAllowedByAdmin && (
        <div className="alert alert-warning" style={{ fontWeight: 600 }}>
          Attendance scanning is currently stopped by admin.
        </div>
      )}

      {rfidWarning && (
        <div className="modal d-block" tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content bg-dark text-white">
              <div className="modal-header">
                <h5 className="modal-title">RFID Card Not Registered</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setRfidWarning(false)} />
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  This card ID is not registered. Please contact an administrator to register the card.
                </p>
                {pendingCardId && (
                  <div className="mt-2 small text-muted">Card ID: {pendingCardId}</div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-light" onClick={() => setRfidWarning(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <RfidInputListener active={effectiveScannerActive} onScan={handleRfidScan} />
      <QrScanner onDecode={handleQrScan} active={effectiveScannerActive} cooldownMs={1500} />

      <div
        className="mt-3"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: 14,
          color: "rgba(255,255,255,0.92)",
        }}
      >
        <div className="d-flex justify-content-between">
          <span style={{ opacity: 0.85 }}>Last Action</span>
          <b>{latest?.action ? String(latest.action).replace("_", "-") : "—"}</b>
        </div>

        <div className="d-flex justify-content-between mt-2">
          <span style={{ opacity: 0.85 }}>Check-in Time</span>
          <b>{formatTime(checkInTime)}</b>
        </div>

        <div className="d-flex justify-content-between mt-2">
          <span style={{ opacity: 0.85 }}>Check-out Time</span>
          <b>{formatTime(checkOutTime)}</b>
        </div>

        <div className="mt-3 d-flex gap-2">
          <button
            className="btn btn-sm btn-outline-light w-100"
            onClick={() => {
              clearCache();
              setLatest(null);
              setCheckInTime(null);
              setCheckOutTime(null);
              setStatusMsg({ type: "info", text: "Cleared local display (cache cleared)." });
            }}
          >
            Clear Display
          </button>

          <button
            className="btn btn-sm btn-outline-light w-100"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
