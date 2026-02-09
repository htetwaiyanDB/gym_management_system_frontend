import React, { useEffect, useState } from "react";
import axiosClient from "../../api/axiosClient";

function getNotificationType(notification) {
  if (!notification) return "";
  const rawTypeParts = [
    notification?.type,
    notification?.category,
    notification?.data?.type,
    notification?.data?.category,
    notification?.data?.notification_type,
    notification?.data?.event,
  ]
    .filter(Boolean)
    .join(" ");
  return String(rawTypeParts).toLowerCase();
}

function resolveBlogTitle(notification) {
  return (
    notification?.data?.blog_title ||
    notification?.data?.blog?.title ||
    notification?.blog_title ||
    notification?.blog?.title ||
    ""
  );
}

function formatNotificationBody(notification) {
  if (!notification) return "No details provided.";

  const type = getNotificationType(notification);
  const blogTitle = resolveBlogTitle(notification);
  const blogFallbackTitle = notification?.data?.title || notification?.title || "";

  if (type.includes("blog") || blogTitle) {
    return blogTitle || blogFallbackTitle || "New blog post";
  }

  if (type.includes("message")) {
    return "Admin sent message to you";
  }

  if (notification.message) return notification.message;
  if (notification.title) return notification.title;
  if (notification.data?.message) return notification.data.message;
  if (notification.data?.title) return notification.data.title;
  if (typeof notification.data === "string") return notification.data;
  return "Notification received.";
}

export default function Notifications() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const loadNotifications = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await axiosClient.get("/notifications");
      const list = Array.isArray(res?.data) ? res.data : res?.data?.data || res?.data?.notifications || [];
      setNotifications(Array.isArray(list) ? list : []);
    } catch (err) {
      setMsg(
        err?.response?.data?.message || "Failed to load notifications."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markAllRead = async () => {
    setMsg(null);
    try {
      await axiosClient.post("/notifications/read-all");
      setNotifications((prev) =>
        prev.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))
      );
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to mark all as read.");
    }
  };

  const markRead = async (notificationId) => {
    if (!notificationId) return;
    setMsg(null);
    try {
      await axiosClient.post(`/notifications/${notificationId}/read`);
      setNotifications((prev) =>
        prev.map((item) =>
          item?.id === notificationId ? { ...item, read_at: item.read_at || new Date().toISOString() } : item
        )
      );
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to mark notification as read.");
    }
  };

  return (
    <div className="admin-card p-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h4 className="mb-1">Notifications</h4>
          <div className="text-muted small">Latest alerts and updates.</div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-light" onClick={loadNotifications} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button className="btn btn-primary" onClick={markAllRead} disabled={loading || notifications.length === 0}>
            Mark all read
          </button>
        </div>
      </div>

      {msg && <div className="alert alert-danger">{msg}</div>}

      <div className="list-group">
        {notifications.length === 0 ? (
          <div className="text-muted">No notifications yet.</div>
        ) : (
          notifications.map((item) => {
            const body = formatNotificationBody(item);
            const createdAt = item?.created_at
              ? new Date(item.created_at).toLocaleString()
              : "Just now";
            const isRead = Boolean(item?.read_at);
            return (
              <div
                key={item?.id || body}
                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-start ${
                  isRead ? "bg-dark text-light" : "bg-secondary text-white"
                }`}
              >
                <div className="me-3">
                  <div className="fw-semibold">{body}</div>
                  <div className="small text-muted">{createdAt}</div>
                </div>
                <button
                  className="btn btn-sm btn-outline-light"
                  onClick={() => markRead(item?.id)}
                  disabled={isRead}
                >
                  {isRead ? "Read" : "Mark read"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
