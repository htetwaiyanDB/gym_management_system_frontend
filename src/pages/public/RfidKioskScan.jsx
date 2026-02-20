import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { scanRfidAttendance } from "../../api/attendanceApi";
import { useGlobalScanner } from "../../hooks/useGlobalScanner";
import RfidInputListener from "../../components/RfidInputListener";
import { normalizeCardId } from "../../utils/rfid";
import "./AuthGlass.css";

function normalizeAction(value) {
  const action = String(value || "")
    .toLowerCase()
    .replace("-", "_");

  if (action === "check_in" || action === "check_out") return action;
  return null;
}

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export default function RfidKioskScan() {
  const busyRef = useRef(false);
  const [manualCardId, setManualCardId] = useState("");
  const [status, setStatus] = useState(null);
  const [lastRecord, setLastRecord] = useState(null);
  const { isScanningEnabled } = useGlobalScanner();

  const nextActionLabel = useMemo(() => {
    const action = normalizeAction(lastRecord?.action || lastRecord?.type || lastRecord?.status);
    return action === "check_in" ? "check out" : "check in";
  }, [lastRecord]);

  const handleScan = async (rawCardId) => {
    if (!isScanningEnabled) {
      setStatus({ type: "warning", text: "Scanner is currently paused by admin." });
      return;
    }

    if (busyRef.current) return;
    busyRef.current = true;

    try {
      setStatus(null);
      const cardId = normalizeCardId(rawCardId);

      if (!cardId) {
        setStatus({ type: "danger", text: "Invalid RFID card." });
        return;
      }

      const res = await scanRfidAttendance(cardId);
      const record = res?.data?.record || res?.data || null;
      const message =
        res?.data?.message ||
        (normalizeAction(record?.action) === "check_out"
          ? "Checked out successfully."
          : "Checked in successfully.");

      setLastRecord(record);
      setStatus({ type: "success", text: message });
      setManualCardId("");
    } catch (error) {
      setStatus({
        type: "danger",
        text:
          error?.response?.data?.message ||
          "Scan failed. Please contact front desk if this continues.",
      });
    } finally {
      busyRef.current = false;
    }
  };

  return (
    <div className="auth-bg d-flex align-items-center justify-content-center p-3">
      <div className="glass-card p-4 w-100" style={{ maxWidth: 680 }}>
        <h4 className="login-title mb-2">RFID Member Card Scan</h4>
        <p className="glass-subtitle mb-3">
          No login needed. Tap your member card to {nextActionLabel}.
        </p>

        {!isScanningEnabled && (
          <div className="alert alert-warning">Scanner is turned off by admin right now.</div>
        )}

        {status && <div className={`alert alert-${status.type}`}>{status.text}</div>}

        <div className="card bg-dark bg-opacity-25 border-light-subtle mb-3">
          <div className="card-body">
            <h6 className="mb-2">Manual input (backup)</h6>
            <form
              className="d-flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleScan(manualCardId);
              }}
            >
              <input
                className="form-control"
                placeholder="Enter RFID card id"
                value={manualCardId}
                onChange={(e) => setManualCardId(e.target.value)}
              />
              <button className="btn btn-primary" disabled={!isScanningEnabled}>
                Scan
              </button>
            </form>
          </div>
        </div>

        <div className="card bg-dark bg-opacity-25 border-light-subtle mb-3">
          <div className="card-body">
            <h6 className="mb-2">Last scan</h6>
            <div className="small text-light-emphasis">
              <div>Action: {normalizeAction(lastRecord?.action || lastRecord?.type || lastRecord?.status) || "—"}</div>
              <div>
                Time: {formatDateTime(lastRecord?.timestamp || lastRecord?.scanned_at || lastRecord?.created_at)}
              </div>
              <div>
                Name: {lastRecord?.user_name || lastRecord?.name || "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="d-flex justify-content-between align-items-center">
          <Link to="/login" className="link-muted text-decoration-none">
            Go to login
          </Link>
          <small className="text-light-emphasis">After login, users and trainers can view attendance history.</small>
        </div>
      </div>

      <RfidInputListener active={isScanningEnabled} onScan={handleScan} captureOnEditable={false} />
    </div>
  );
}
