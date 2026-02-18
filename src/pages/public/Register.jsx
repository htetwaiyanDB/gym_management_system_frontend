import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../api/axiosClient";
import "./AuthGlass.css";

export default function Register() {
  const nav = useNavigate();
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { role: "user" },
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [captchaHtml, setCaptchaHtml] = useState("");

  const loadCaptcha = async () => {
    const res = await axiosClient.get("/captcha");
    setCaptchaHtml(res.data?.captcha || "");
  };

  const refreshCaptcha = async () => {
    const res = await axiosClient.get("/captcha/refresh");
    setCaptchaHtml(res.data?.captcha || "");
  };

  useEffect(() => {
    loadCaptcha().catch(() => {});
  }, []);

  const onSubmit = async (data) => {
    setMsg(null);
    setLoading(true);

    try {
      // captcha included only for UI (backend doesn’t validate it currently)
      const payload = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role, // "user" | "trainer"
        password: data.password,
        password_confirmation: data.password_confirmation,
      };

      const res = await axiosClient.post("/register", payload);

      // store email for verify page
      sessionStorage.setItem("verify_email", res.data?.email || data.email);

      nav("/verify-email");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Registration failed.");
      refreshCaptcha().catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const pwd = watch("password");

  return (
    <div className="auth-bg d-flex align-items-center justify-content-center p-3">
      <div className="glass-card p-4 w-100" style={{ maxWidth: 520 }}>
        <div className="mb-4">
          <div className="login-icon">
            <i className="bi bi-activity"></i>
          </div>
          <h4 className="login-title">Welcome to UNITY FITNESS</h4>
          <p className="glass-subtitle">Create your account</p>
        </div>

        {msg && <div className="alert alert-danger">{msg}</div>}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-3">
            <label className="form-label">Full Name</label>
            <input
              className={`form-control ${errors.name ? "is-invalid" : ""}`}
              placeholder="Enter your name"
              {...register("name", { required: "Required" })}
            />
            {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
          </div>

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Email</label>
              <input
                className={`form-control ${errors.email ? "is-invalid" : ""}`}
                placeholder="example@gmail.com"
                {...register("email", { required: "Required" })}
              />
              {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
            </div>

            <div className="col-md-6">
              <label className="form-label">Phone</label>
              <input
                className={`form-control ${errors.phone ? "is-invalid" : ""}`}
                placeholder="09xxxxxxxxx"
                {...register("phone", { required: "Required" })}
              />
              {errors.phone && <div className="invalid-feedback">{errors.phone.message}</div>}
            </div>
          </div>

          <div className="mt-3 mb-3">
            <label className="form-label">Register As</label>
            <select className="form-select" {...register("role", { required: true })}>
              <option value="user">User</option>
              <option value="trainer">Trainer</option>
            </select>
          </div>

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Password</label>
              <input
                type="password"
                className={`form-control ${errors.password ? "is-invalid" : ""}`}
                placeholder="Enter password"
                {...register("password", { required: "Required", minLength: { value: 4, message: "Min 4 characters" } })}
              />
              {errors.password && <div className="invalid-feedback">{errors.password.message}</div>}
              <div className="text-muted small mt-1">
                Use upper/lowercase, number & symbol.
              </div>
            </div>

            <div className="col-md-6">
              <label className="form-label">Confirm Password</label>
              <input
                type="password"
                className={`form-control ${errors.password_confirmation ? "is-invalid" : ""}`}
                placeholder="Confirm password"
                {...register("password_confirmation", {
                  required: "Required",
                  validate: (v) => v === pwd || "Passwords do not match",
                })}
              />
              {errors.password_confirmation && (
                <div className="invalid-feedback">{errors.password_confirmation.message}</div>
              )}
            </div>
          </div>

          {/* CAPTCHA (UI only) */}
          <div className="mt-3 mb-3">
            <label className="form-label">Captcha</label>
            <div className="captcha-box d-flex align-items-center gap-2">
              <div
                className="captcha-img flex-grow-1"
                dangerouslySetInnerHTML={{ __html: captchaHtml }}
              />
              <button
                type="button"
                className="btn btn-outline-light"
                onClick={() => refreshCaptcha().catch(() => {})}
                title="Refresh captcha"
              >
                ↻
              </button>
            </div>

            <input
              className="form-control mt-2"
              placeholder="Enter captcha (for display)"
              {...register("captcha")}
            />
          </div>

          <button className="btn btn-primary w-100" disabled={loading}>
            {loading ? "Creating..." : "REGISTER"}
          </button>

          <div className="text-center mt-3">
            <button
              type="button"
              className="btn btn-link link-muted text-decoration-none p-0"
              onClick={() => nav("/login")}
            >
              Already have an account? Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
