import React, { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logoutApi } from "../api/authApi";
import { clearRequestCache } from "../api/axiosClient";
import { getAdminUnreadMessageCount } from "../api/adminMessagesApi";
import AppScrollbar from "../components/AppScrollbar";
import RouteTransition from "../components/RouteTransition";
import "./AdminLayout.css";

export default function AdminLayout() {
  const nav = useNavigate();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  const loadUnreadMessageCount = useCallback(async () => {
    try {
      const count = await getAdminUnreadMessageCount();
      setUnreadMessageCount(count);
    } catch {
      // Keep the last successful count if the notification request fails.
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadUnreadMessageCount(); }, 0);
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void loadUnreadMessageCount();
    };
    const onMessagesUpdated = (event) => {
      const suppliedCount = Number(event?.detail?.unreadCount);
      if (Number.isFinite(suppliedCount) && suppliedCount >= 0) {
        setUnreadMessageCount(Math.floor(suppliedCount));
        return;
      }
      void loadUnreadMessageCount();
    };

    const interval = window.setInterval(refreshIfVisible, 30000);
    window.addEventListener("focus", refreshIfVisible);
    window.addEventListener("admin-messages-updated", onMessagesUpdated);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      window.removeEventListener("admin-messages-updated", onMessagesUpdated);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadUnreadMessageCount]);

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
      <aside className="admin-sidebar">
        <AppScrollbar className="admin-sidebar-scroll" style={{ maxHeight: "100%" }}>
          <div className="p-3">
            <div className="mb-3">
              <div className="d-flex align-items-center gap-2">
              <img
              src="/UNITY LOGO.jpg"
              alt="Unity Fitness Gym"
              className="rounded-circle"
              style={{
                width: 42,
                height: 42,
                objectFit: "cover",
                border: "1px solid rgba(255,255,255,0.16)",
              }}
            />
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
                <i className="bi bi-credit-card-2-front"></i> Memberships
              </NavLink>

              <NavLink to="/admin/subscriptions/classes" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
                <i className="bi bi-collection-play"></i> Class Memberships
              </NavLink>

              <NavLink to="/admin/pricing" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
                <i className="bi bi-cash-coin"></i> Pricing
              </NavLink>

              <NavLink to="/admin/trainer-bookings" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
                <i className="bi bi-calendar-check"></i> Trainer Bookings
              </NavLink>
              
              <NavLink to="/admin/boxing-bookings" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
                <i className="bi bi-lightning-charge"></i> Boxing Bookings
              </NavLink>

              <NavLink to="/admin/attendance" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
                <i className="bi bi-credit-card-2-front-fill"></i> Attendance
              </NavLink>

              <NavLink to="/admin/points" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
                <i className="bi bi-award"></i> Points
              </NavLink>

              <NavLink to="/admin/messages" className={({isActive}) => `admin-link ${isActive ? "active" : ""}`}>
                <i className="bi bi-chat-dots"></i>
                <span>Messages</span>
                {unreadMessageCount > 0 && (
                  <span className="admin-message-badge" aria-label={`${unreadMessageCount} unread messages`}>
                    {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                  </span>
                )}
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
          </div>
        </AppScrollbar>
      </aside>

      {/* Main */}
      <main className="admin-main">
        <AppScrollbar className="admin-main-scroll" style={{ maxHeight: "100%" }}>
          <div className="admin-main-inner">
            <div className="admin-topbar d-flex align-items-center justify-content-between mb-3">
              <div>
                <div style={{ fontWeight: 600 }}>Welcome, Admin</div>
                <div className="admin-muted small">Manage your gym system here</div>
              </div>
              <div className="small admin-muted">
                <i className="bi bi-shield-lock me-1"></i> Secure Admin
              </div>
            </div>

            <RouteTransition>
              <Outlet />
            </RouteTransition>
          </div>
        </AppScrollbar>
      </main>
    </div>
  );
}
