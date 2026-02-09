import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axiosClient from "../../api/axiosClient";

function moneyMMK(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-US") + " MMK";
}

function normalizeList(payload, fallbackKey) {
  if (Array.isArray(payload?.[fallbackKey])) return payload[fallbackKey];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

function pickFirstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return null;
}

function getRecordUserId(record) {
  const direct = pickFirstValue(record, [
    "member_id",
    "memberId",
    "user_id",
    "userId",
    "member_id_fk",
  ]);
  if (direct) return direct;
  const memberId = record?.member?.id ?? record?.member?.user_id;
  if (memberId) return memberId;
  const userId = record?.user?.id ?? record?.user?.user_id;
  if (userId) return userId;
  return null;
}

function normalizeStatus(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return "pending";
  if (s === "confirmed") return "active";
  if (s === "cancelled" || s === "canceled") return "on-hold";
  if (s === "hold") return "on-hold";
  return s;
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "active") return <span className="badge bg-success">Active</span>;
  if (normalized === "completed") return <span className="badge bg-secondary">Completed</span>;
  if (normalized === "on-hold") return <span className="badge bg-warning text-dark">On Hold</span>;
  if (normalized === "expired") return <span className="badge bg-secondary">Expired</span>;
  return <span className="badge bg-info text-dark">{normalized}</span>;
}

export default function AdminUserHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const userFromState = location.state?.user ?? null;

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const [subscriptions, setSubscriptions] = useState([]);
  const [trainerBookings, setTrainerBookings] = useState([]);
  const [boxingBookings, setBoxingBookings] = useState([]);

  const normalizedUserId = useMemo(() => String(id || ""), [id]);

  const filterByUser = (list) => {
    if (!normalizedUserId) return list;
    return list.filter((record) => {
      const recordUserId = getRecordUserId(record);
      if (!recordUserId) return false;
      return String(recordUserId) === normalizedUserId;
    });
  };

  const loadHistory = async () => {
    setMsg(null);
    setLoading(true);
    try {
      const [subsRes, trainerRes, boxingRes] = await Promise.allSettled([
        axiosClient.get("/subscriptions"),
        axiosClient.get("/trainer-bookings"),
        axiosClient.get("/boxing-bookings"),
      ]);

      if (subsRes.status === "fulfilled") {
        const list = normalizeList(subsRes.value.data, "subscriptions");
        setSubscriptions(filterByUser(list));
      } else {
        setSubscriptions([]);
        setMsg({
          type: "danger",
          text: subsRes.reason?.response?.data?.message || "Failed to load subscriptions.",
        });
      }

      if (trainerRes.status === "fulfilled") {
        const list = normalizeList(trainerRes.value.data, "bookings");
        setTrainerBookings(filterByUser(list));
      } else {
        setTrainerBookings([]);
        setMsg({
          type: "danger",
          text: trainerRes.reason?.response?.data?.message || "Failed to load trainer bookings.",
        });
      }

      if (boxingRes.status === "fulfilled") {
        const list = normalizeList(boxingRes.value.data, "bookings");
        setBoxingBookings(filterByUser(list));
      } else {
        setBoxingBookings([]);
        setMsg({
          type: "danger",
          text: boxingRes.reason?.response?.data?.message || "Failed to load boxing bookings.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [id]);

  const resumeSubscription = async (subscriptionId) => {
    setMsg(null);
    setBusyKey(`subscription-${subscriptionId}`);
    try {
      const res = await axiosClient.post(`/subscriptions/${subscriptionId}/resume`);
      setMsg({ type: "success", text: res?.data?.message || "Subscription activated." });
      await loadHistory();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to activate subscription.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const activateTrainerBooking = async (bookingId) => {
    setMsg(null);
    setBusyKey(`trainer-${bookingId}`);
    try {
      const res = await axiosClient.patch(`/trainer-bookings/${bookingId}/mark-active`);
      setMsg({ type: "success", text: res?.data?.message || "Trainer booking activated." });
      await loadHistory();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to activate trainer booking.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const activateBoxingBooking = async (bookingId) => {
    setMsg(null);
    setBusyKey(`boxing-${bookingId}`);
    try {
      const res = await axiosClient.patch(`/boxing-bookings/${bookingId}/mark-active`);
      setMsg({ type: "success", text: res?.data?.message || "Boxing booking activated." });
      await loadHistory();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to activate boxing booking.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const headerName = userFromState?.name || userFromState?.username || "User";
  const headerEmail = userFromState?.email || null;
  const headerPhone = userFromState?.phone || null;

  return (
    <div className="admin-card p-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h4 className="mb-1">User History</h4>
          <div className="admin-muted">
            View subscriptions and bookings for <strong>{headerName}</strong>.
          </div>
          <div className="text-muted small">
            {headerEmail && <span className="me-2">{headerEmail}</span>}
            {headerPhone && <span>{headerPhone}</span>}
          </div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-light" onClick={() => navigate("/admin/users")}>
            Back to Users
          </button>
          <button className="btn btn-outline-light" onClick={loadHistory} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="mb-4">
        <h5 className="mb-3">Subscriptions</h5>
        {subscriptions.length === 0 ? (
          <div className="text-center text-muted py-4">
            {loading ? "Loading..." : "No subscriptions found."}
          </div>
        ) : (
          <div className="row g-3">
            {subscriptions.map((subscription) => {
              const status = normalizeStatus(subscription?.status);
              const canActivate =
                status === "on-hold" || status === "pending" || status === "inactive";
              return (
                <div className="col-12 col-lg-6 col-xxl-4" key={subscription?.id ?? Math.random()}>
                  <div className="card bg-dark text-white border-secondary h-100 shadow-sm">
                    <div className="card-body d-flex flex-column gap-3">
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <div>
                          <div className="text-muted small">Subscription ID</div>
                          <div className="fw-bold">{subscription?.id ?? "-"}</div>
                        </div>
                        {statusBadge(subscription?.status)}
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        <span className="badge bg-primary">{subscription?.plan_name || "-"}</span>
                        <span className="badge bg-secondary">{moneyMMK(subscription?.price)}</span>
                      </div>
                      <div className="d-grid gap-2 small">
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">Start</span>
                          <span>{subscription?.start_date || "-"}</span>
                        </div>
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">End</span>
                          <span>{subscription?.end_date || "-"}</span>
                        </div>
                      </div>
                      <div className="mt-auto">
                        <button
                          className="btn btn-sm btn-success w-100"
                          disabled={!canActivate || busyKey === `subscription-${subscription?.id}`}
                          onClick={() => resumeSubscription(subscription?.id)}
                        >
                          {busyKey === `subscription-${subscription?.id}` ? "..." : "Activate"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-4">
        <h5 className="mb-3">Trainer Bookings</h5>
        {trainerBookings.length === 0 ? (
          <div className="text-center text-muted py-4">
            {loading ? "Loading..." : "No trainer bookings found."}
          </div>
        ) : (
          <div className="row g-3">
            {trainerBookings.map((booking) => {
              const status = normalizeStatus(booking?.status);
              const canActivate = status === "pending" || status === "on-hold";
              return (
                <div className="col-12 col-lg-6 col-xxl-4" key={booking?.id ?? Math.random()}>
                  <div className="card bg-dark text-white border-secondary h-100 shadow-sm">
                    <div className="card-body d-flex flex-column gap-3">
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <div>
                          <div className="text-muted small">Booking ID</div>
                          <div className="fw-bold">{booking?.id ?? "-"}</div>
                        </div>
                        {statusBadge(booking?.status)}
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        <span className="badge bg-info text-dark">
                          {booking?.trainer_name || booking?.trainer?.name || "-"}
                        </span>
                        <span className="badge bg-primary">
                          {booking?.package_name || booking?.trainer_package?.name || "-"}
                        </span>
                        <span className="badge bg-secondary">
                          {moneyMMK(booking?.total_price ?? booking?.price)}
                        </span>
                      </div>
                      <div className="d-grid gap-2 small">
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">Start</span>
                          <span>{booking?.start_date || "-"}</span>
                        </div>
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">End</span>
                          <span>{booking?.end_date || "-"}</span>
                        </div>
                      </div>
                      <div className="mt-auto">
                        <button
                          className="btn btn-sm btn-success w-100"
                          disabled={!canActivate || busyKey === `trainer-${booking?.id}`}
                          onClick={() => activateTrainerBooking(booking?.id)}
                        >
                          {busyKey === `trainer-${booking?.id}` ? "..." : "Activate"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h5 className="mb-3">Boxing Bookings</h5>
        {boxingBookings.length === 0 ? (
          <div className="text-center text-muted py-4">
            {loading ? "Loading..." : "No boxing bookings found."}
          </div>
        ) : (
          <div className="row g-3">
            {boxingBookings.map((booking) => {
              const status = normalizeStatus(booking?.status);
              const canActivate = status === "pending" || status === "on-hold";
              return (
                <div className="col-12 col-lg-6 col-xxl-4" key={booking?.id ?? Math.random()}>
                  <div className="card bg-dark text-white border-secondary h-100 shadow-sm">
                    <div className="card-body d-flex flex-column gap-3">
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <div>
                          <div className="text-muted small">Booking ID</div>
                          <div className="fw-bold">{booking?.id ?? "-"}</div>
                        </div>
                        {statusBadge(booking?.status)}
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        <span className="badge bg-info text-dark">
                          {booking?.coach_name || booking?.coach?.name || "-"}
                        </span>
                        <span className="badge bg-primary">
                          {booking?.package_name || booking?.boxing_package?.name || "-"}
                        </span>
                        <span className="badge bg-secondary">
                          {moneyMMK(booking?.total_price ?? booking?.price)}
                        </span>
                      </div>
                      <div className="d-grid gap-2 small">
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">Start</span>
                          <span>{booking?.start_date || "-"}</span>
                        </div>
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">End</span>
                          <span>{booking?.end_date || "-"}</span>
                        </div>
                      </div>
                      <div className="mt-auto">
                        <button
                          className="btn btn-sm btn-success w-100"
                          disabled={!canActivate || busyKey === `boxing-${booking?.id}`}
                          onClick={() => activateBoxingBooking(booking?.id)}
                        >
                          {busyKey === `boxing-${booking?.id}` ? "..." : "Activate"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
