import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  FiHome,
  FiRepeat,
  FiCalendar,
  FiMessageCircle,
  FiSettings,
} from "react-icons/fi";
import "./UserLayout.css";

export default function UserLayout() {
  const [isMobile, setIsMobile] = useState(true);

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
          to="/user/subscriptions"
          className={({ isActive }) => "user-nav-item" + (isActive ? " active" : "")}
        >
          <FiRepeat className="user-nav-icon" />
          <span className="user-nav-label">Subs</span>
        </NavLink>

        <NavLink
          to="/user/bookings"
          className={({ isActive }) => "user-nav-item" + (isActive ? " active" : "")}
        >
          <FiCalendar className="user-nav-icon" />
          <span className="user-nav-label">Booking</span>
        </NavLink>

        <NavLink
          to="/user/messages"
          className={({ isActive }) => "user-nav-item" + (isActive ? " active" : "")}
        >
          <FiMessageCircle className="user-nav-icon" />
          <span className="user-nav-label">Messages</span>
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
