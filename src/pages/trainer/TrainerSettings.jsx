
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaLongArrowAltRight } from "react-icons/fa";
import axiosClient from "../../api/axiosClient";
import { scanRfidAttendance } from "../../api/attendanceApi";
import RfidInputListener from "../../components/RfidInputListener";
import { getUserProfile, updateUserProfile } from "../../api/userApi";
import { isCardNotRegisteredError, normalizeCardId } from "../../utils/rfid";

function parseBackendDateTime(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(value) {
  const date = parseBackendDateTime(value);
  if (!date) return false;
  return isSameDay(date, new Date());
}

function formatTime(value) {
  const date = parseBackendDateTime(value);
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function normalizeAction(action) {
  if (!action) return null;
  return String(action).toLowerCase().replace("-", "_");
}

function getAction(obj) {
  return normalizeAction(obj?.action ?? obj?.type ?? obj?.status ?? obj?.event ?? null);
}

function getTimestamp(obj) {
  return obj?.timestamp ?? obj?.time ?? obj?.scanned_at ?? obj?.created_at ?? null;
}

export default function TrainerSettings() {
  const storedUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);
  const busyRef = useRef(false);

  const [form, setForm] = useState({
    name: storedUser?.name || "",
    email: storedUser?.email || "",
    phone: storedUser?.phone || "",
    password: "",
    passwordConfirm: "",
  });
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [attendanceMsg, setAttendanceMsg] = useState(null);
  const [latestAction, setLatestAction] = useState(null);
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);

  const card = {
    borderRadius: 16,
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: 16,
    color: "#fff",
    backdropFilter: "blur(8px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
  };

  const logoutBtn = {
    width: "100%",
    padding: "14px 12px",
    borderRadius: 14,
    border: "1px solid rgba(220,53,69,0.45)",
    background: "rgba(220,53,69,0.25)",
    color: "#fff",
    fontWeight: 900,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  };

  const inputStyle = {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#fff",
  };

  const labelStyle = {
    fontWeight: 700,
    marginBottom: 6,
  };

  const loadProfile = async () => {
    setLoadingProfile(true);
    try {
      const res = await getUserProfile();
      const data = res?.data?.user || res?.data?.data || res?.data;
      if (data) {
        setForm((prev) => ({
          ...prev,
          name: data?.name ?? prev.name,
          email: data?.email ?? prev.email,
          phone: data?.phone ?? prev.phone,
        }));
      }
    } catch {
      // ignore load errors, keep stored values
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await axiosClient.get("/trainer/check-in");
        const payload = res?.data || {};
        const latestScan = payload?.latest_scan ?? null;
        const scans = Array.isArray(payload?.recent_scans) ? payload.recent_scans : [];

        const lastIn = scans.find((scan) => getAction(scan) === "check_in")?.timestamp || null;
        const lastOut = scans.find((scan) => getAction(scan) === "check_out")?.timestamp || null;

        if (!alive) return;

        const latestTs = getTimestamp(latestScan);
        const nextLatest = latestTs && isToday(latestTs) ? latestScan : null;
        const nextIn = lastIn && isToday(lastIn) ? lastIn : null;
        const nextOut = lastOut && isToday(lastOut) ? lastOut : null;

        setLatestAction(getAction(nextLatest));
        setCheckInTime(nextIn);
        setCheckOutTime(nextOut);
      } catch (e) {
        if (!alive) return;
        setAttendanceMsg({
          type: "warning",
          text: e?.response?.data?.message || "Unable to load attendance status.",
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleChange = (field) => (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);

    if (form.password && form.password !== form.passwordConfirm) {
      setMessage({ type: "danger", text: "Passwords do not match." });
      return;
    }

    if (!storedUser?.id) {
      setMessage({
        type: "danger",
        text: "Unable to update profile. Please log in again.",
      });
      return;
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    };

    if (form.password) {
      payload.password = form.password;
    }

    setSaving(true);
    try {
      const res = await updateUserProfile(payload);
      const data = res?.data?.user || res?.data?.data || res?.data;

      if (data) {
        const merged = { ...(storedUser || {}), ...data };
        const serialized = JSON.stringify(merged);
        if (localStorage.getItem("user")) {
          localStorage.setItem("user", serialized);
        }
        if (sessionStorage.getItem("user")) {
          sessionStorage.setItem("user", serialized);
        }
      }

      setForm((prev) => ({
        ...prev,
        password: "",
        passwordConfirm: "",
      }));
      setMessage({ type: "success", text: "Profile updated successfully." });
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.errors?.[0] ||
        "Failed to update profile.";
      setMessage({ type: "danger", text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axiosClient.post("/logout");
    } catch {
      // even if backend fails, continue logout locally
    }

    // clear auth data
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    // redirect to login
    window.location.href = "/login";
  };

  const handleRfidScan = async (rawCardId) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setAttendanceMsg(null);

    const cardId = normalizeCardId(rawCardId);
    if (!cardId) {
      setAttendanceMsg({ type: "danger", text: "Invalid RFID card ID." });
      busyRef.current = false;
      return;
    }

    try {
      const res = await scanRfidAttendance(cardId);
      const record = res?.data?.record ?? res?.data ?? null;
      const action = getAction(record);
      const timestamp = getTimestamp(record);

      if (!timestamp || !isToday(timestamp)) {
        setAttendanceMsg({
          type: "warning",
          text: res?.data?.message || "Recorded, but timestamp is not today.",
        });
        return;
      }

      setLatestAction(action);

      if (action === "check_in") {
        setCheckInTime(timestamp);
        setCheckOutTime(null);
        setAttendanceMsg({ type: "success", text: "Check-in successful." });
      } else if (action === "check_out") {
        setCheckOutTime(timestamp);
        setAttendanceMsg({ type: "success", text: "Check-out successful." });
      } else {
        setAttendanceMsg({ type: "success", text: res?.data?.message || "Recorded." });
      }
    } catch (e) {
      const errorMessage = e?.response?.data?.message || "Scan failed.";
      setAttendanceMsg({
        type: isCardNotRegisteredError(errorMessage) ? "warning" : "danger",
        text: isCardNotRegisteredError(errorMessage)
          ? "RFID card not registered. Please contact an administrator."
          : errorMessage,
      });
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 700);
    }
  };

  return (
    <div className="container py-3" style={{ maxWidth: 520 }}>
      <RfidInputListener active onScan={handleRfidScan} />
      <div style={card} className="mb-3">
        <div style={{ fontSize: 16, fontWeight: 800 }}>Attendance Today</div>
        <div className="small" style={{ opacity: 0.9, marginTop: 6 }}>
          Scan your RFID card to check in and check out.
        </div>
        {attendanceMsg ? (
          <div className={`alert alert-${attendanceMsg.type} py-2 mt-3`} role="alert">
            {attendanceMsg.text}
          </div>
        ) : null}
        <div className="d-flex justify-content-between mt-3">
          <span style={{ opacity: 0.85 }}>Last Action</span>
          <b>{latestAction ? latestAction.replace("_", "-") : "—"}</b>
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
      {/* Header */}
      <div style={card} className="mb-3">
        <div style={{ fontSize: 18, fontWeight: 900 }}>Settings</div>
        <div className="small" style={{ opacity: 0.9, marginTop: 6 }}>
          Trainer account
        </div>
      </div>

      <div style={card} className="mb-3">
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>
          Edit profile
        </div>
        {message ? (
          <div className={`alert alert-${message.type} py-2`} role="alert">
            {message.text}
          </div>
        ) : null}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label style={labelStyle} className="form-label">
              Name
            </label>
            <input
              type="text"
              className="form-control"
              style={inputStyle}
              value={form.name}
              onChange={handleChange("name")}
              placeholder="Enter your name"
              disabled={saving || loadingProfile}
            />
          </div>
          <div className="mb-3">
            <label style={labelStyle} className="form-label">
              Email
            </label>
            <input
              type="email"
              className="form-control"
              style={inputStyle}
              value={form.email}
              onChange={handleChange("email")}
              placeholder="Enter your email"
              disabled={saving || loadingProfile}
            />
          </div>
          <div className="mb-3">
            <label style={labelStyle} className="form-label">
              Phone
            </label>
            <input
              type="tel"
              className="form-control"
              style={inputStyle}
              value={form.phone}
              onChange={handleChange("phone")}
              placeholder="Enter your phone number"
              disabled={saving || loadingProfile}
            />
          </div>
          <div className="mb-3">
            <label style={labelStyle} className="form-label">
              New password
            </label>
            <input
              type="password"
              className="form-control"
              style={inputStyle}
              value={form.password}
              onChange={handleChange("password")}
              placeholder="Enter a new password"
              disabled={saving || loadingProfile}
            />
          </div>
          <div className="mb-3">
            <label style={labelStyle} className="form-label">
              Confirm password
            </label>
            <input
              type="password"
              className="form-control"
              style={inputStyle}
              value={form.passwordConfirm}
              onChange={handleChange("passwordConfirm")}
              placeholder="Confirm new password"
              disabled={saving || loadingProfile}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-100 fw-bold"
            disabled={saving || loadingProfile}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>

      {/* Logout only */}
      <div style={card}>
        <button style={logoutBtn} onClick={handleLogout}>
          <FaLongArrowAltRight />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
