import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logoutApi } from "../api/authApi";
import { clearRequestCache } from "../api/axiosClient";
import "./AdminLayout.css";

export default function AdminLayout() {
  const nav = useNavigate();

  const logout = async () => {
    try { await logoutApi(); } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    clearRequestCache();
    nav("/login");
  };

  return (
    <div className="admin-shell d-flex">
      {/* Sidebar */}
      <aside className="admin-sidebar p-3">
        <div className="mb-3">
          <div className="d-flex align-items-center gap-2">
            <div className="rounded-circle d-flex align-items-center justify-content-center"
                 style={{
                   width: 42, height: 42,
                   background: "rgba(255,255,255,0.12)",
                   border: "1px solid rgba(255,255,255,0.16)"
                 }}>
              <i className="bi bi-activity text-white"></i>
            </div>
            <div>
              <div className="admin-brand">UNITY FITNESS</div>
              <div className="admin-subtitle">Admin Dashboard</div>
            </div>
          </div>
        </div>

        <div className="d-flex flex-column gap-2">
          <NavLink to="/admin/dashboard" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
            <i className="bi bi-speedometer2"></i> Dashboard
          </NavLink>

          <NavLink to="/admin/users" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
            <i className="bi bi-people"></i> Users
          </NavLink>

          <NavLink to="/admin/subscriptions" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
            <i className="bi bi-credit-card-2-front"></i> Subscriptions
          </NavLink>

          <NavLink to="/admin/pricing" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
            <i className="bi bi-cash-coin"></i> Pricing
          </NavLink>

          <NavLink to="/admin/trainer-bookings" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
            <i className="bi bi-calendar-check"></i> Trainer Bookings
          </NavLink>

          <NavLink to="/admin/attendance" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
            <i className="bi bi-qr-code-scan"></i> Attendance
          </NavLink>

          <NavLink to="/admin/messages" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
            <i className="bi bi-chat-dots"></i> Messages
          </NavLink>

          <NavLink to="/admin/blogs" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
            <i className="bi bi-journal-text"></i> Blogs
          </NavLink>

          <NavLink to="/admin/settings" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
            <i className="bi bi-gear"></i> Settings
          </NavLink>
        </div>

        <hr style={{ borderColor: "rgba(255,255,255,0.15)" }} />

        <button className="btn btn-outline-light w-100" onClick={logout}>
          <i className="bi bi-box-arrow-right me-2"></i> Logout
        </button>
      </aside>

      {/* Main */}
      <main className="admin-main">
        <div className="admin-topbar d-flex align-items-center justify-content-between mb-3">
          <div>
            <div style={{ fontWeight: 600 }}>Welcome, Admin</div>
            <div className="admin-muted small">Manage your gym system here</div>
          </div>
          <div className="small admin-muted">
            <i className="bi bi-shield-lock me-1"></i> Secure Admin
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
