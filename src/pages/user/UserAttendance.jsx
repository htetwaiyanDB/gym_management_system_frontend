import React, { useEffect, useMemo, useRef, useState } from "react";
import axiosClient from "../../api/axiosClient";
import QrScanner from "../common/QrScanner";
import { parseTokenFromQrText } from "../../utils/qr";

/** --------------------------
 * Robust date parsing helpers
 * -------------------------- */
function parseBackendDateTime(value) {
  if (!value) return null;

  // If backend returns an object (rare), try common fields
  if (typeof value === "object") {
    const v =
      value.timestamp ||
      value.time ||
      value.scanned_at ||
      value.created_at ||
      value.updated_at ||
      value.check_in_time ||
      value.check_out_time ||
      null;
    return parseBackendDateTime(v);
  }

  // Normalize string formats:
  // "2026-01-21 10:30:00" -> "2026-01-21T10:30:00"
  const raw = String(value).trim();
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");

  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatTime(value) {
  const d = parseBackendDateTime(value);
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isToday(value) {
  const d = parseBackendDateTime(value);
  if (!d) return false;
  return isSameDay(d, new Date());
}

/** --------------------------
 * Record helpers
 * -------------------------- */
function getRecordAction(record) {
  if (!record || typeof record !== "object") return null;
  const raw = record.action ?? record.type ?? record.status ?? record.event ?? null;
  if (!raw) return null;
  return String(raw).toLowerCase().replace("-", "_");
}

function getRecordTimestamp(record) {
  if (!record || typeof record !== "object") return record ?? null;
  return (
    record.timestamp ||
    record.time ||
    record.scanned_at ||
    record.created_at ||
    record.updated_at ||
    record.check_in_time ||
    record.check_out_time ||
    null
  );
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") return record;
  const action = getRecordAction(record);
  if (!action || record.action) return record;
  return { ...record, action };
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  return getRecordTimestamp(value);
}

function lastTimestampFromList(list, predicate) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const filtered = predicate ? list.filter(predicate) : list;
  if (filtered.length === 0) return null;
  return normalizeTimestamp(filtered[filtered.length - 1]);
}

function lastRecordFromList(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const filtered = list.filter(Boolean);
  if (filtered.length === 0) return null;
  return filtered[filtered.length - 1];
}

function pickFirstValue(source, keys) {
  if (!source) return null;
  for (const key of keys) {
    const value = source?.[key];
    if (value) return value;
  }
  return null;
}

/** --------------------------
 * localStorage persistence
 * -------------------------- */
const STORAGE_KEY = "user_attendance_today_v1";

function loadCachedAttendance() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    // Only keep today's cache
    if (!isToday(data?.cachedAt)) return null;

    return data;
  } catch {
    return null;
  }
}

function saveCachedAttendance({ latest, checkInTime, checkOutTime }) {
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
    // ignore storage errors
  }
}

function clearCachedAttendance() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function UserAttendance() {
  const isMobile = useMemo(() => window.innerWidth < 768, []);
  const busyRef = useRef(false);

  const [scannerActive, setScannerActive] = useState(true);

  const [statusMsg, setStatusMsg] = useState(null);
  const [latest, setLatest] = useState(null);
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);

  const nextAction = useMemo(() => {
    if (getRecordAction(latest) === "check_in") return "check_out";
    return "check_in";
  }, [latest]);

  // 1) Load cached immediately (so refresh won't lose UI)
  useEffect(() => {
    const cached = loadCachedAttendance();
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

        const latestScan = normalizeRecord(
          payload.latest_scan ||
            payload.latest ||
            payload.last_scan ||
            lastRecordFromList(payload.records) ||
            lastRecordFromList(payload.history) ||
            null
        );

        const lastIn =
          pickFirstValue(payload, [
            "last_check_in",
            "last_checkin",
            "lastCheckIn",
            "check_in_time",
            "checkin_time",
            "checkInTime",
            "last_check_in_time",
          ]) ||
          lastTimestampFromList(payload.check_ins) ||
          lastTimestampFromList(payload.checkins) ||
          lastTimestampFromList(payload.records, (record) =>
            ["check_in", "in"].includes(getRecordAction(record))
          ) ||
          lastTimestampFromList(payload.history, (record) =>
            ["check_in", "in"].includes(getRecordAction(record))
          ) ||
          null;

        const lastOut =
          pickFirstValue(payload, [
            "last_check_out",
            "last_checkout",
            "lastCheckOut",
            "check_out_time",
            "checkout_time",
            "checkOutTime",
            "last_check_out_time",
          ]) ||
          lastTimestampFromList(payload.check_outs) ||
          lastTimestampFromList(payload.checkouts) ||
          lastTimestampFromList(payload.records, (record) =>
            ["check_out", "out"].includes(getRecordAction(record))
          ) ||
          lastTimestampFromList(payload.history, (record) =>
            ["check_out", "out"].includes(getRecordAction(record))
          ) ||
          null;

        if (!alive) return;

        const latestTimestamp = getRecordTimestamp(latestScan);
        const latestIsToday = isToday(latestTimestamp);

        const nextLatest = latestIsToday ? latestScan : null;
        const nextIn = isToday(lastIn) ? lastIn : null;
        const nextOut = isToday(lastOut) ? lastOut : null;

        setLatest(nextLatest);
        setCheckInTime(nextIn);
        setCheckOutTime(nextOut);

        if (nextLatest || nextIn || nextOut) {
          saveCachedAttendance({
            latest: nextLatest,
            checkInTime: nextIn,
            checkOutTime: nextOut,
          });
        } else {
          clearCachedAttendance();
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

  const handleScan = async (decodedText) => {
    if (busyRef.current) return;
    busyRef.current = true;

    setStatusMsg(null);

    const parsed = parseTokenFromQrText(decodedText);
    if (!parsed?.token) {
      setStatusMsg({ type: "danger", text: "Invalid QR code format." });
      busyRef.current = false;
      return;
    }

    try {
      // Pause scanning while calling API (prevents double submission)
      setScannerActive(false);

      const res = await axiosClient.post("/user/check-in/scan", {
        token: parsed.token,
      });

      const record = normalizeRecord(res?.data?.record || null);
      const action =
        getRecordAction(record) ||
        getRecordAction(res?.data) ||
        res?.data?.action ||
        res?.data?.type ||
        null;

      const timestamp =
        getRecordTimestamp(record) ||
        res?.data?.timestamp ||
        res?.data?.time ||
        res?.data?.scanned_at ||
        null;

      const latestRecord =
        record || (action || timestamp ? { action, timestamp } : null);

      const latestToday = isToday(timestamp) ? latestRecord : null;

      setLatest(latestToday);

      if (action === "check_in") {
        const inTime = isToday(timestamp) ? timestamp : null;
        setCheckInTime(inTime);
        setCheckOutTime(null);
        setStatusMsg({
          type: "success",
          text: res?.data?.message || "Check-in recorded.",
        });

        saveCachedAttendance({
          latest: latestToday,
          checkInTime: inTime,
          checkOutTime: null,
        });

        // allow second scan for check-out
        setScannerActive(true);
      } else if (action === "check_out") {
        setCheckOutTime(timestamp);
        setStatusMsg({
          type: "success",
          text: res?.data?.message || "Check-out recorded.",
        });

        saveCachedAttendance({
          latest: latestToday,
          checkInTime,
          checkOutTime: timestamp,
        });

        // stop scanner after check-out
        setScannerActive(false);
      } else {
        setStatusMsg({
          type: "success",
          text: res?.data?.message || "Recorded.",
        });

        saveCachedAttendance({
          latest: latestToday,
          checkInTime,
          checkOutTime,
        });

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
      }, 600);
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
      {/* Header card */}
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
            <span className={`badge ${scannerActive ? "bg-success" : "bg-secondary"}`}>
              {scannerActive ? "Scanner ON" : "Scanner OFF"}
            </span>
          </div>
        </div>

        <div className="d-flex justify-content-between mt-3">
          <div style={{ opacity: 0.9 }}>
            Next action:{" "}
            <b>{nextAction === "check_in" ? "CHECK-IN" : "CHECK-OUT"}</b>
          </div>

          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-outline-light"
              onClick={() => setScannerActive(true)}
              disabled={scannerActive}
            >
              Start
            </button>
            <button
              className="btn btn-sm btn-outline-light"
              onClick={() => setScannerActive(false)}
              disabled={!scannerActive}
            >
              Stop
            </button>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className={`alert alert-${statusMsg.type}`} style={{ fontWeight: 600 }}>
          {statusMsg.text}
        </div>
      )}

      {/* Scanner */}
      <QrScanner onDecode={handleScan} active={scannerActive} cooldownMs={1500} />

      {/* Result card */}
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
          <b>{latest?.action ? latest.action.replace("_", "-") : "—"}</b>
        </div>

        <div className="d-flex justify-content-between mt-2">
          <span style={{ opacity: 0.85 }}>Check-in Time</span>
          <b>{formatTime(checkInTime)}</b>
        </div>

        <div className="d-flex justify-content-between mt-2">
          <span style={{ opacity: 0.85 }}>Check-out Time</span>
          <b>{formatTime(checkOutTime)}</b>
        </div>
      </div>
    </div>
  );
}
