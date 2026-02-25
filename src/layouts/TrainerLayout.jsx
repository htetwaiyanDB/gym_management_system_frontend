import { NavLink, Outlet } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import {
  FiHome,
  FiLogIn,
  FiBell,
  FiMessageCircle,
  FiCalendar,
  FiSettings,
} from "react-icons/fi";
import axiosClient from "../api/axiosClient";
import AppScrollbar from "../components/AppScrollbar";
import "./TrainerLayout.css";

export default function TrainerLayout() {
  const [isMobile, setIsMobile] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await axiosClient.get("/notifications", { cache: { ttlMs: 12000 } });
      const list = Array.isArray(res?.data) ? res.data : res?.data?.data || res?.data?.notifications || [];
      const unread = list.filter((item) => !item?.read_at).length;
      setUnreadCount((prev) => (prev === unread ? prev : unread));
    } catch {
      // Silently fail - don't show badge if we can't fetch
      setUnreadCount((prev) => (prev === 0 ? prev : 0));
    }
  }, []);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        window.setTimeout(() => {
      fetchUnreadCount();
    }, 0);
      }
    };

    window.setTimeout(() => {
      fetchUnreadCount();
    }, 0);
    // poll less aggressively to reduce render/network churn while preserving feature
    const interval = setInterval(refreshIfVisible, 20000);

    const handleFocus = () => {
      window.setTimeout(() => {
      fetchUnreadCount();
    }, 0);
    };
    const handleNotificationUpdate = () => {
      window.setTimeout(() => {
      fetchUnreadCount();
    }, 0);
    };
    const handleVisibility = () => refreshIfVisible();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("notifications-updated", handleNotificationUpdate);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("notifications-updated", handleNotificationUpdate);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchUnreadCount]);

  useEffect(() => {
    const check = () => {
      const next = window.innerWidth <= 767;
      setIsMobile((prev) => (prev === next ? prev : next));
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ✅ mobile-only trainer view
  if (!isMobile) {
    return (
      <div className="trainer-shell">
        <AppScrollbar className="trainer-scrollbar">
          <main className="trainer-content">
            <div>
              <h2>Mobile Only</h2>
              <p>Please open Trainer View on a mobile device.</p>
              <p style={{ opacity: 0.8, marginTop: 8 }}>(Max width: 767px)</p>

              <div style={{ marginTop: 14 }}>
                <button
                  onClick={() => (window.location.href = "/")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Go Back
                </button>
              </div>
            </div>
          </main>
        </AppScrollbar>
      </div>
    );
  }

  return (
    <div className="trainer-shell">
      <AppScrollbar className="trainer-scrollbar">
        <main className="trainer-content">
          <Outlet />
        </main>
      </AppScrollbar>

      <nav className="trainer-bottom-nav" aria-label="Trainer bottom navigation">
        <NavLink
          to="/trainer/home"
          className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
        >
          <FiHome className="nav-icon" />
          <span className="nav-label">Home</span>
        </NavLink>

        <NavLink
          to="/trainer/scan"
          className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
        >
          <FiLogIn className="nav-icon" />
          <span className="nav-label">Check In</span>
        </NavLink>

        <NavLink
          to="/trainer/messages"
          className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
        >
          <FiMessageCircle className="nav-icon" />
          <span className="nav-label">Messages</span>
        </NavLink>

        <NavLink
          to="/trainer/bookings"
          className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
        >
          <FiCalendar className="nav-icon" />
          <span className="nav-label">Bookings</span>
        </NavLink>

         <NavLink
          to="/trainer/notifications"
          className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
        >
          <div style={{ position: "relative" }}>
            <FiBell className="nav-icon" />
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: "#dc3545",
                  boxShadow: "0 0 0 2px rgba(220, 53, 69, 0.25)",
                }}
                aria-hidden="true"
              />
            )}
          </div>
          <span className="nav-label">Alerts</span>
        </NavLink>


        <NavLink
          to="/trainer/settings"
          className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
        >
          <FiSettings className="nav-icon" />
          <span className="nav-label">Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
