import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axiosClient from "../../api/axiosClient";
import "./AuthGlass.css";

export default function Login() {
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Captcha served from backend route
  const backendUrl =
    import.meta.env.VITE_BACKEND_URL || "https://api.unityfitnessmyanmar.online/api";

  // Start with empty, set once in useEffect to avoid extra request during render
  const [captchaUrl, setCaptchaUrl] = useState("");

  const refreshCaptcha = () => {
    // Prevent refresh while submitting (avoids canceled requests / mismatch)
    if (loading) return;

    // Clear the input because new captcha will be generated
    setCaptcha("");

    // Bust cache to always get a fresh captcha
    setCaptchaUrl(`${backendUrl}/captcha?ts=${Date.now()}`);
  };

  useEffect(() => {
    refreshCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);

    // Basic guard: don’t submit without captcha
    if (!captcha || captcha.trim().length === 0) {
      setMsg("Please enter captcha.");
      return;
    }

    setLoading(true);

    try {
      const res = await axiosClient.post("/login", {
        identifier,
        password,
        captcha: captcha.trim(),
      });

      const token = res?.data?.token;
      const user = res?.data?.user;

      if (!token || !user) throw new Error("Invalid login response");

      // IMPORTANT: your axiosClient must read the same key.
      // If axiosClient reads "token", keep this.
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));

      const role = String(user?.role || "").toLowerCase();

      if (role === "administrator" || role === "admin") {
        navigate("/admin/dashboard", { replace: true });
      } else if (role === "trainer") {
        navigate("/trainer/home", { replace: true });
      } else {
        navigate("/user/home", { replace: true });
      }
    } catch (err) {
      // show server message if present
      const serverMsg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.captcha?.[0] ||
        "Login failed.";

      setMsg(serverMsg);

      // On failure, refresh captcha (new challenge)
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

          <div className="mb-3">
            <label className="form-label">Captcha</label>

            <div className="captcha-box d-flex align-items-center gap-2">
              <div className="captcha-img flex-grow-1">
                {captchaUrl ? (
                  <img src={captchaUrl} alt="captcha" />
                ) : (
                  <div style={{ height: 48 }} />
                )}
              </div>

              <button
                type="button"
                className="btn btn-outline-light"
                onClick={refreshCaptcha}
                disabled={loading}
                title="Refresh captcha"
              >
                ↻
              </button>
            </div>

            <input
              className="form-control mt-2"
              placeholder="Enter captcha"
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              required
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