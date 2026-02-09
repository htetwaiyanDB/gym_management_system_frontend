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
        <h5 className="mb-2">Subscriptions</h5>
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th style={{ width: 90 }}>ID</th>
                <th>Plan</th>
                <th>Price</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th style={{ width: 140 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted py-3">
                    {loading ? "Loading..." : "No subscriptions found."}
                  </td>
                </tr>
              ) : (
                subscriptions.map((subscription) => {
                  const status = normalizeStatus(subscription?.status);
                  const canActivate =
                    status === "on-hold" || status === "pending" || status === "inactive";
                  return (
                    <tr key={subscription?.id ?? Math.random()}>
                      <td>{subscription?.id ?? "-"}</td>
                      <td>
                        <span className="badge bg-primary">{subscription?.plan_name || "-"}</span>
                      </td>
                      <td>{moneyMMK(subscription?.price)}</td>
                      <td>{subscription?.start_date || "-"}</td>
                      <td>{subscription?.end_date || "-"}</td>
                      <td>{statusBadge(subscription?.status)}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-success"
                          disabled={!canActivate || busyKey === `subscription-${subscription?.id}`}
                          onClick={() => resumeSubscription(subscription?.id)}
                        >
                          {busyKey === `subscription-${subscription?.id}` ? "..." : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-4">
        <h5 className="mb-2">Trainer Bookings</h5>
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th style={{ width: 90 }}>ID</th>
                <th>Trainer</th>
                <th>Package</th>
                <th>Price</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th style={{ width: 140 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {trainerBookings.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center text-muted py-3">
                    {loading ? "Loading..." : "No trainer bookings found."}
                  </td>
                </tr>
              ) : (
                trainerBookings.map((booking) => {
                  const status = normalizeStatus(booking?.status);
                  const canActivate = status === "pending" || status === "on-hold";
                  return (
                    <tr key={booking?.id ?? Math.random()}>
                      <td>{booking?.id ?? "-"}</td>
                      <td>{booking?.trainer_name || booking?.trainer?.name || "-"}</td>
                      <td>{booking?.package_name || booking?.trainer_package?.name || "-"}</td>
                      <td>{moneyMMK(booking?.total_price ?? booking?.price)}</td>
                      <td>{booking?.start_date || "-"}</td>
                      <td>{booking?.end_date || "-"}</td>
                      <td>{statusBadge(booking?.status)}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-success"
                          disabled={!canActivate || busyKey === `trainer-${booking?.id}`}
                          onClick={() => activateTrainerBooking(booking?.id)}
                        >
                          {busyKey === `trainer-${booking?.id}` ? "..." : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h5 className="mb-2">Boxing Bookings</h5>
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th style={{ width: 90 }}>ID</th>
                <th>Coach</th>
                <th>Package</th>
                <th>Price</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th style={{ width: 140 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {boxingBookings.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center text-muted py-3">
                    {loading ? "Loading..." : "No boxing bookings found."}
                  </td>
                </tr>
              ) : (
                boxingBookings.map((booking) => {
                  const status = normalizeStatus(booking?.status);
                  const canActivate = status === "pending" || status === "on-hold";
                  return (
                    <tr key={booking?.id ?? Math.random()}>
                      <td>{booking?.id ?? "-"}</td>
                      <td>{booking?.coach_name || booking?.coach?.name || "-"}</td>
                      <td>{booking?.package_name || booking?.boxing_package?.name || "-"}</td>
                      <td>{moneyMMK(booking?.total_price ?? booking?.price)}</td>
                      <td>{booking?.start_date || "-"}</td>
                      <td>{booking?.end_date || "-"}</td>
                      <td>{statusBadge(booking?.status)}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-success"
                          disabled={!canActivate || busyKey === `boxing-${booking?.id}`}
                          onClick={() => activateBoxingBooking(booking?.id)}
                        >
                          {busyKey === `boxing-${booking?.id}` ? "..." : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
