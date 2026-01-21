import React, { useEffect, useMemo, useRef, useState } from "react";
import axiosClient from "../../api/axiosClient";
import QrScanner from "../common/QrScanner";
import { parseTokenFromQrText } from "../../utils/qr";

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return isSameDay(d, new Date());
}

function getRecordTimestamp(record) {
  return record?.timestamp || record?.created_at || record?.updated_at || null;
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

export default function UserAttendance() {
  const isMobile = useMemo(() => window.innerWidth < 768, []);
  const busyRef = useRef(false);

  const [scannerActive, setScannerActive] = useState(true);

  const [statusMsg, setStatusMsg] = useState(null);
  const [latest, setLatest] = useState(null);
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);

  const nextAction = useMemo(() => {
    if (latest?.action === "check_in") return "check_out";
    return "check_in";
  }, [latest]);

  // Load initial status
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await axiosClient.get("/user/check-in");
         const payload = res?.data || {};

        // ✅ different backends use different keys, so we handle common ones
        const latestScan =
          payload.latest_scan ||
          payload.latest ||
          lastRecordFromList(payload.records) ||
          lastRecordFromList(payload.history) ||
          null;
        const lastIn =
          payload.last_check_in ||
          payload.check_in_time ||
          lastTimestampFromList(payload.check_ins) ||
          lastTimestampFromList(payload.checkins) ||
          lastTimestampFromList(payload.records, (record) =>
            ["check_in", "in"].includes(record?.action || record?.type)
          ) ||
          lastTimestampFromList(payload.history, (record) =>
            ["check_in", "in"].includes(record?.action || record?.type)
          ) ||
          null;
        const lastOut =
          payload.last_check_out ||
          payload.check_out_time ||
          lastTimestampFromList(payload.check_outs) ||
          lastTimestampFromList(payload.checkouts) ||
          lastTimestampFromList(payload.records, (record) =>
            ["check_out", "out"].includes(record?.action || record?.type)
          ) ||
          lastTimestampFromList(payload.history, (record) =>
            ["check_out", "out"].includes(record?.action || record?.type)
          ) ||
          null;

        if (!alive) return;

        const latestTimestamp = getRecordTimestamp(latestScan);
        const latestIsToday = isToday(latestTimestamp);

        setLatest(latestIsToday ? latestScan : null);
        setCheckInTime(isToday(lastIn) ? lastIn : null);
        setCheckOutTime(isToday(lastOut) ? lastOut : null);
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

      const record = res?.data?.record || null;
      const action = record?.action;
      const timestamp = getRecordTimestamp(record);

      setLatest(isToday(timestamp) ? record : null);

      if (action === "check_in") {
        setCheckInTime(isToday(timestamp) ? timestamp : null);
        setCheckOutTime(null);
        setStatusMsg({
          type: "success",
          text: res?.data?.message || "Check-in recorded.",
        });

        // ✅ allow second scan for check-out
        setScannerActive(true);
      } else if (action === "check_out") {
        setCheckOutTime(timestamp);
        setStatusMsg({
          type: "success",
          text: res?.data?.message || "Check-out recorded.",
        });

        // ✅ stop scanner after check-out (same behavior we used before)
        setScannerActive(false);
      } else {
        setStatusMsg({
          type: "success",
          text: res?.data?.message || "Recorded.",
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

      {/* ✅ scanner (always mounted; controlled by active) */}
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
