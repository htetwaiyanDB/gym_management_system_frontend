import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosClient from "../../api/axiosClient";
import "./AuthGlass.css";

export default function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaChallenge, setCaptchaChallenge] = useState(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const captchaRequestId = useRef(0);

  const refreshCaptcha = useCallback(async ({ preserveMessages = false } = {}) => {
    const requestId = ++captchaRequestId.current;
    setCaptcha("");
    setCaptchaChallenge(null);
    setCaptchaLoading(true);
    if (!preserveMessages) setMessages([]);

    try {
      const res = await axiosClient.get("/captcha");
      const key = res?.data?.key;
      const image = res?.data?.img;
      if (!key || !image) throw new Error("Invalid CAPTCHA response");

      // One state update keeps each image paired with the key returned alongside it.
      if (requestId === captchaRequestId.current) setCaptchaChallenge({ key, image });
    } catch {
      if (requestId === captchaRequestId.current) {
        const loadError = "Unable to load CAPTCHA. Please refresh and try again.";
        setMessages((current) =>
          preserveMessages ? [...new Set([...current, loadError])] : [loadError],
        );
      }
    } finally {
      if (requestId === captchaRequestId.current) setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCaptcha();
    return () => {
      captchaRequestId.current += 1;
    };
  }, [refreshCaptcha]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessages([]);

    if (!captcha.trim()) {
      setMessages(["Please enter the CAPTCHA."]);
      return;
    }
    if (!captchaChallenge?.key) {
      setMessages(["CAPTCHA is not ready. Please refresh and try again."]);
      void refreshCaptcha();
      return;
    }

    setLoading(true);
    try {
      const res = await axiosClient.post("/login", {
        identifier,
        password,
        captcha: captcha.trim(),
        captcha_key: captchaChallenge.key,
      });
      const token = res?.data?.token;
      const user = res?.data?.user;
      if (!token || !user) throw new Error("Invalid login response");

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
    } catch (error) {
      setMessages(getLoginErrorMessages(error));
      // Validation consumes the stateless key, including when login fails.
      await refreshCaptcha({ preserveMessages: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg d-flex align-items-center justify-content-center p-3">
      <div className="glass-card p-4 w-100" style={{ maxWidth: 520 }}>
        <div className="mb-4">
          <div className="login-icon">
            <img src="/UNITY%20LOGO.jpg" alt="Unity Fitness logo" className="login-logo" />
          </div>
          <h4 className="login-title">Welcome to UNITY FITNESS</h4>
          <p className="glass-subtitle">Sign in to continue</p>
        </div>

        {messages.length > 0 && (
          <div className="alert alert-danger" role="alert">
            {messages.length === 1 ? messages[0] : (
              <ul className="mb-0 ps-3">
                {messages.map((message) => <li key={message}>{message}</li>)}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label" htmlFor="login-identifier">Email or Phone</label>
            <input id="login-identifier" className="form-control" placeholder="Enter email or phone"
              value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input id="login-password" type="password" className="form-control" placeholder="Enter password"
              value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="login-captcha">Captcha</label>
            <div className="captcha-box d-flex align-items-center gap-2">
              <div className="captcha-img flex-grow-1">
                {captchaChallenge?.image ? (
                  <img src={captchaChallenge.image} alt="CAPTCHA challenge" />
                ) : <div style={{ height: 48 }} />}
              </div>
              <button type="button" className="btn btn-outline-light"
                onClick={() => void refreshCaptcha()} disabled={loading || captchaLoading}
                title="Refresh captcha" aria-label="Refresh CAPTCHA">↻</button>
            </div>

            <input id="login-captcha" className="form-control mt-2" placeholder="Enter captcha"
              value={captcha} onChange={(event) => setCaptcha(event.target.value)}
              inputMode="numeric" autoComplete="off" required />
          </div>

          <button className="btn btn-primary w-100"
            disabled={loading || captchaLoading || !captchaChallenge?.key}>
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="text-center mt-3">
            <span className="link-muted">Don’t have an account?</span>{" "}
            <Link to="/register" className="link-muted text-decoration-none">Register</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function getLoginErrorMessages(error) {
  const data = error?.response?.data;
  if (!data || typeof data !== "object") return ["Login failed. Please try again."];

  const messages = [];
  const add = (label, value) => {
    const values = Array.isArray(value) ? value : [value];
    values.forEach((item) => {
      if (typeof item === "string" && item.trim()) {
        messages.push(label ? `${label}: ${item}` : item);
      }
    });
  };
  const labels = {
    identifier: "Email or phone",
    password: "Password",
    captcha: "CAPTCHA",
    captcha_key: "CAPTCHA",
  };

  if (data.errors && typeof data.errors === "object") {
    Object.entries(data.errors).forEach(([field, value]) => add(labels[field] || field, value));
  }
  // Some validation responses return these fields without an `errors` wrapper.
  Object.entries(labels).forEach(([field, label]) => {
    if (data[field] !== undefined) add(label, data[field]);
  });

  if (messages.length === 0) add("", data.message);
  return [...new Set(messages.length > 0 ? messages : ["Login failed. Please try again."])];
}
