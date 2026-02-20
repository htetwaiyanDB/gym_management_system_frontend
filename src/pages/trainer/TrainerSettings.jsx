
import React, { useEffect, useMemo, useState } from "react";
import { FaLongArrowAltRight } from "react-icons/fa";
import axiosClient from "../../api/axiosClient";
import { clearPersistedSession } from "../../utils/sessionPersistence";
import { getUserProfile, updateUserProfile } from "../../api/userApi";

export default function TrainerSettings() {
  const storedUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

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

  const handleChange = (field) => (event) => {
    const rawValue = event.target.value;
    const value =
      field === "password" || field === "passwordConfirm"
        ? rawValue.replace(/\D/g, "").slice(0, 4)
        : rawValue;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);

    if (form.password && !/^\d{4}$/.test(form.password)) {
      setMessage({ type: "danger", text: "Password must be exactly 4 numbers." });
      return;
    }

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
      payload.password_confirmation = form.passwordConfirm;
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
    clearPersistedSession();

    // redirect to login
    window.location.href = "/login";
  };

  return (
    <div className="container py-3" style={{ maxWidth: 520 }}>
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
              placeholder="Enter a 4-digit password"
              inputMode="numeric"
              maxLength={4}
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
              placeholder="Confirm 4-digit password"
              inputMode="numeric"
              maxLength={4}
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
