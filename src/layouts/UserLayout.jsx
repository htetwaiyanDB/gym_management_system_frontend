import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logoutApi } from "../api/authApi";
import "./UserLayout.css";

function getUser() {
  const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

export default function UserLayout() {
  const nav = useNavigate();
  const user = getUser();

  const logout = async () => {
    try {
      await logoutApi();
    } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    nav("/login");
  };

  return (
    <div className="user-shell d-flex">
      <aside className="user-sidebar">
        <div className="d-flex align-items-center gap-2 mb-4">
          <div className="user-logo">
            <i className="bi bi-activity"></i>
          </div>
          <div>
            <div className="user-brand">UNITY FITNESS</div>
            <div className="user-subtitle">Member Panel</div>
          </div>
        </div>

        <nav className="user-nav d-flex flex-column gap-2">
          <NavLink
            to="/user/home"
            className={({ isActive }) =>
              `user-nav-link ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-house"></i> Home
          </NavLink>
          <NavLink
            to="/user/check-in"
            className={({ isActive }) =>
              `user-nav-link ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-qr-code-scan"></i> Check-in
          </NavLink>
          <NavLink
            to="/user/subscriptions"
            className={({ isActive }) =>
              `user-nav-link ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-credit-card"></i> Subscriptions
          </NavLink>
          <NavLink
            to="/user/messages"
            className={({ isActive }) =>
              `user-nav-link ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-chat-dots"></i> Messages
          </NavLink>
          <NavLink
            to="/user/settings"
            className={({ isActive }) =>
              `user-nav-link ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-gear"></i> Settings
          </NavLink>
        </nav>

        <button className="btn btn-outline-secondary w-100 mt-4" onClick={logout}>
          <i className="bi bi-box-arrow-right me-2"></i> Logout
        </button>
      </aside>

      <main className="user-main">
        <div className="user-topbar d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
          <div>
            <div className="fw-semibold">Welcome back{user?.name ? "," : ""}</div>
            <div className="text-muted small">
              {user?.name || "Manage your fitness journey"}
            </div>
          </div>
          <div className="text-muted small d-flex align-items-center gap-2">
            <i className="bi bi-shield-check"></i>
            <span>Secure Member Access</span>
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}