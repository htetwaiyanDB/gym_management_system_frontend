import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axiosClient from "../../api/axiosClient";
import "./AuthGlass.css";

export default function Login() {
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState(""); // UI only
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // ✅ Always show captcha image using Laravel WEB captcha route
  // (No CORS / no HTML injection issues)
  const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://8.222.195.9:6060";
  const [captchaUrl, setCaptchaUrl] = useState(`${backendUrl}/captcha?${Date.now()}`);

  const refreshCaptcha = () => {
    setCaptchaUrl(`${backendUrl}/captcha?${Date.now()}`);
  };

  useEffect(() => {
    refreshCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const res = await axiosClient.post("/api/login", {
        // email: identifier, // ✅ FIXED
        identifier,
        password,
        captcha, // (backend validating)
      });

      const token = res?.data?.token;
      const user = res?.data?.user;

      if (!token || !user) throw new Error("Invalid login response");

      localStorage.setItem("ACCESS_TOKEN", token);
      localStorage.setItem("user", JSON.stringify(user));

      const role = String(user?.role || "").toLowerCase();

      // ✅ FIXED NAVIGATION (matches your real App.jsx routes)
      if (role === "administrator" || role === "admin") {
        navigate("/admin/dashboard", { replace: true });
      } else if (role === "trainer") {
        navigate("/trainer/scan", { replace: true });
      } else {
        navigate("/user/scan", { replace: true });
      }
    } catch (err) {
      setMsg(err?.response?.data?.message || "Login failed.");
      refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg d-flex align-items-center justify-content-center p-3">
      <div className="glass-card p-4 w-100" style={{ maxWidth: 520 }}>
        <div className="mb-4">
          <div className="login-icon">
            <i className="bi bi-activity"></i>
          </div>
          <h4 className="login-title">Welcome to UNITY FITNESS</h4>
          <p className="glass-subtitle">Sign in to continue</p>
        </div>

        {msg && <div className="alert alert-danger">{msg}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Email or Phone</label>
            <input
              className="form-control"
              placeholder="Enter email or phone"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* ✅ CAPTCHA (UI only) — now it will ALWAYS appear */}
          <div className="mb-3">
            <label className="form-label">Captcha</label>

            <div className="captcha-box d-flex align-items-center gap-2">
              <div className="captcha-img flex-grow-1">
                <img src={captchaUrl} alt="captcha" />
              </div>

              <button
                type="button"
                className="btn btn-outline-light"
                onClick={refreshCaptcha}
                title="Refresh captcha"
              >
                ↻
              </button>
            </div>

            <input
              className="form-control mt-2"
              placeholder="Enter captcha (for display)"
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value)}
            />
          </div>

          <button className="btn btn-primary w-100" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="text-center mt-3">
            <span className="link-muted">Don’t have an account?</span>{" "}
            <Link to="/register" className="link-muted text-decoration-none">
              Register
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
