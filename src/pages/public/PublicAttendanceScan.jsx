import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import RfidInputListener from "../../components/RfidInputListener";
import { normalizeCardId, isCardNotRegisteredError } from "../../utils/rfid";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://8.222.195.9:6060";
const STORAGE_KEY = "public_attendance_scan_cache_v1";
const SCAN_CONTROL_READ_ENDPOINTS = [
  "/attendance/scanner-control",
  "/attendance/scanner/status",
  "/attendance/scan-control",
];

function parseBackendDateTime(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isToday(value) {
  const date = parseBackendDateTime(value);
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatTime(value) {
  const date = parseBackendDateTime(value);
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function normalizeAction(value) {
  if (!value) return null;
  return String(value).toLowerCase().replace("-", "_");
}

function extractRecord(payload) {
  return payload?.record ?? payload?.attendance ?? payload?.data?.record ?? payload?.data ?? null;
}

function getAction(record) {
  return normalizeAction(record?.action ?? record?.type ?? record?.status ?? record?.event ?? null);
}

function getTimestamp(record) {
  return record?.timestamp ?? record?.time ?? record?.scanned_at ?? record?.created_at ?? record?.updated_at ?? null;
}

function loadCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!isToday(data?.cachedAt)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(payload) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      cachedAt: new Date().toISOString(),
      ...payload,
    })
  );
}

export default function PublicAttendanceScan() {
  const isMobile = useMemo(() => window.innerWidth < 768, []);
  const busyRef = useRef(false);

  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);
  const [latest, setLatest] = useState(null);
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [pendingCardId, setPendingCardId] = useState("");

  const nextAction = useMemo(() => {
    const action = getAction(latest);
    return action === "check_in" ? "check_out" : "check_in";
  }, [latest]);

  const syncScannerStatus = useCallback(async () => {
    for (const path of SCAN_CONTROL_READ_ENDPOINTS) {
      try {
        const res = await axios.get(`${API_BASE_URL}${path}`, {
          headers: { Accept: "application/json" },
        });
        const data = res?.data || {};
        const isActive =
          data?.scanner_active ??
          data?.scan_active ??
          data?.is_active ??
          data?.active ??
          data?.enabled ??
          data?.status;

        const normalized = [true, 1, "1", "active", "enabled", "on", "true"].includes(
          String(isActive).toLowerCase() === "true" ? true : isActive
        );
        setScannerEnabled(!!normalized);
        return;
      } catch {
        // try next
      }
    }

    // fail open for kiosk mode
    setScannerEnabled(true);
  }, []);

  useEffect(() => {
    const cached = loadCache();
    if (!cached) return;
    setLatest(cached.latest ?? null);
    setCheckInTime(cached.checkInTime ?? null);
    setCheckOutTime(cached.checkOutTime ?? null);
  }, []);

  useEffect(() => {
    syncScannerStatus();
    const id = window.setInterval(syncScannerStatus, 3000);
    return () => window.clearInterval(id);
  }, [syncScannerStatus]);

  const handleScan = async (rawCardId) => {
    if (!scannerEnabled) {
      setStatusMsg({ type: "warning", text: "Scanner is currently stopped by admin." });
      return;
    }

    if (busyRef.current) return;
    busyRef.current = true;
    setStatusMsg(null);
    setPendingCardId("");

    const cardId = normalizeCardId(rawCardId);
    if (!cardId) {
      setStatusMsg({ type: "danger", text: "Invalid member card ID." });
      busyRef.current = false;
      return;
    }

    try {
      const res = await axios.post(
        `${API_BASE_URL}/attendance/rfid/scan`,
        {
          card_id: String(cardId),
          action: nextAction,
          scan_type: nextAction,
          attendance_event: nextAction,
        },
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      const payload = res?.data || {};
      const record = extractRecord(payload);
      const action = getAction(record);
      const timestamp = getTimestamp(record);

      if (!timestamp || !isToday(timestamp)) {
        setStatusMsg({ type: "warning", text: payload?.message || "Recorded, but timestamp is not today." });
        return;
      }

      setLatest(record);
      if (action === "check_in") {
        setCheckInTime(timestamp);
        setCheckOutTime(null);
      } else if (action === "check_out") {
        setCheckOutTime(timestamp);
      }

      saveCache({
        latest: record,
        checkInTime: action === "check_in" ? timestamp : checkInTime,
        checkOutTime: action === "check_out" ? timestamp : checkOutTime,
      });

      setStatusMsg({ type: "success", text: payload?.message || "Attendance recorded successfully." });
    } catch (error) {
      const message = error?.response?.data?.message || "Scan failed.";
      if (isCardNotRegisteredError(message)) {
        setPendingCardId(cardId);
      }
      setStatusMsg({ type: "danger", text: message });
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 700);
    }
  };

  if (!isMobile) {
    return (
      <div className="container py-4" style={{ maxWidth: 560 }}>
        <div className="alert alert-warning mb-3">Attendance scanner works on mobile view only.</div>
        <Link to="/login" className="btn btn-outline-light">Back to Login</Link>
      </div>
    );
  }

  return (
    <div className="container py-3" style={{ maxWidth: 520 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0 text-white">Card Attendance Scanner</h4>
        <Link to="/login" className="btn btn-sm btn-outline-light">Login</Link>
      </div>

      <div className="alert alert-info">
        Scan member card here without login. Admin controls scanner ON/OFF from admin panel.
      </div>

      {statusMsg && <div className={`alert alert-${statusMsg.type}`}>{statusMsg.text}</div>}

      <div className="mb-3">
        <span className={`badge ${scannerEnabled ? "bg-success" : "bg-secondary"}`}>
          {scannerEnabled ? "Scanner ON" : "Scanner OFF"}
        </span>
      </div>

      {pendingCardId && (
        <div className="alert alert-warning">Card ID {pendingCardId} is not registered yet. Please contact admin.</div>
      )}

      <RfidInputListener active={scannerEnabled} onScan={handleScan} />

      <div className="card bg-dark text-white border-secondary">
        <div className="card-body">
          <div className="d-flex justify-content-between">
            <span>Next Action</span>
            <b>{nextAction === "check_in" ? "CHECK-IN" : "CHECK-OUT"}</b>
          </div>
          <div className="d-flex justify-content-between mt-2">
            <span>Last Action</span>
            <b>{latest?.action ? String(latest.action).replace("_", "-") : "—"}</b>
          </div>
          <div className="d-flex justify-content-between mt-2">
            <span>Check-in Time</span>
            <b>{formatTime(checkInTime)}</b>
          </div>
          <div className="d-flex justify-content-between mt-2">
            <span>Check-out Time</span>
            <b>{formatTime(checkOutTime)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
