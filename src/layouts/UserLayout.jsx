import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  FiHome,
  FiCheckSquare,
  FiRepeat,
  FiBell,
  FiMessageCircle,
  FiSettings,
} from "react-icons/fi";
import axiosClient from "../api/axiosClient";
import "./UserLayout.css";

export default function UserLayout() {
  const [isMobile, setIsMobile] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = async () => {
    try {
      const res = await axiosClient.get("/notifications");
      const list = Array.isArray(res?.data) ? res.data : res?.data?.data || res?.data?.notifications || [];
      const unread = list.filter((item) => !item?.read_at).length;
      setUnreadCount(unread);
    } catch (err) {
      // Silently fail - don't show badge if we can't fetch
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    // Poll for new notifications every 5 seconds for near real-time updates
    const interval = setInterval(fetchUnreadCount, 5000);
    return () => clearInterval(interval);
  }, []);

  // Check for updates when window regains focus (user returns to app)
  useEffect(() => {
    const handleFocus = () => {
      fetchUnreadCount();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // Listen for notification updates from other components (e.g., when marking as read)
  useEffect(() => {
    const handleNotificationUpdate = () => {
      fetchUnreadCount();
    };
    window.addEventListener("notifications-updated", handleNotificationUpdate);
    return () => window.removeEventListener("notifications-updated", handleNotificationUpdate);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 767);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Mobile only (same as Trainer)
  if (!isMobile) {
    return (
      <div className="user-shell">
        <main className="user-content">
          <div>
            <h2>User View</h2>
            <p>Please open User View on a mobile device.</p>
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
      </div>
    );
  }

  return (
    <div className="user-shell">
      <main className="user-content">
        <Outlet />
      </main>

      <nav className="user-bottom-nav" aria-label="User bottom navigation">
        <NavLink
          to="/user/home"
          className={({ isActive }) => "user-nav-item" + (isActive ? " active" : "")}
        >
          <FiHome className="user-nav-icon" />
          <span className="user-nav-label">Home</span>
        </NavLink>

        <NavLink
          to="/user/attendance"
          className={({ isActive }) => "user-nav-item" + (isActive ? " active" : "")}
        >
          <FiCheckSquare className="user-nav-icon" />
          <span className="user-nav-label">Attendance</span>
        </NavLink>

        <NavLink
          to="/user/subs-books"
          className={({ isActive }) => "user-nav-item" + (isActive ? " active" : "")}
        >
          <FiRepeat className="user-nav-icon" />
          <span className="user-nav-label">Subs&Books</span>
        </NavLink>

        <NavLink
          to="/user/messages"
          className={({ isActive }) => "user-nav-item" + (isActive ? " active" : "")}
        >
          <FiMessageCircle className="user-nav-icon" />
          <span className="user-nav-label">Messages</span>
        </NavLink>

         <NavLink
          to="/user/notifications"
          className={({ isActive }) => "user-nav-item" + (isActive ? " active" : "")}
        >
          <div style={{ position: "relative" }}>
            <FiBell className="user-nav-icon" />
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
          <span className="user-nav-label">Alerts</span>
        </NavLink>


        <NavLink
          to="/user/settings"
          className={({ isActive }) => "user-nav-item" + (isActive ? " active" : "")}
        >
          <FiSettings className="user-nav-icon" />
          <span className="user-nav-label">Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
