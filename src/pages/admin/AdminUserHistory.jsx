import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axiosClient from "../../api/axiosClient";

function moneyMMK(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-US") + " MMK";
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

const emptyRecords = {
  user: null,
  subscriptions: [],
  trainerBookings: [],
  boxingBookings: [],
};

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildErrorMessage(error) {
  const status = error?.response?.status;
  if (status === 404) return "User not found.";
  if (status === 500) return "Server error. Please try again.";
  return error?.response?.data?.message || "Failed to load user records.";
}

export default function AdminUserHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const userFromState = location.state?.user ?? null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState(emptyRecords);

  const candidateUserIds = useMemo(() => {
    return [
      id,
      userFromState?.id,
      userFromState?.user_id,
      userFromState?.member_id,
      userFromState?.user?.id,
      userFromState?.user?.user_id,
      userFromState?.member?.id,
      userFromState?.member?.user_id,
    ]
      .filter((value) => value !== null && value !== undefined && value !== "")
      .map((value) => String(value));
  }, [id, userFromState]);

  const recordId = candidateUserIds[0] || null;

  const loadRecords = async () => {
    if (!recordId) {
      setRecords(emptyRecords);
      setError("Missing user id for this record.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await axiosClient.get(`/users/${recordId}/records`);
      const payload = res?.data || {};
      setRecords({
        user: payload.user ?? null,
        subscriptions: normalizeArray(payload.subscriptions),
        trainerBookings: normalizeArray(payload.trainerbookings),
        boxingBookings: normalizeArray(payload.boxingbookings),
      });
    } catch (err) {
      setRecords(emptyRecords);
      setError(buildErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [recordId]);

  const headerUser = records.user ?? userFromState;
  const headerName = headerUser?.name || headerUser?.username || "User";
  const headerEmail = headerUser?.email || null;
  const headerPhone = headerUser?.phone || null;
  const headerRole = headerUser?.role || headerUser?.user_role || null;
  const headerId =
    headerUser?.user_id || headerUser?.id || headerUser?.member_id || recordId || "-";

  const headerTitle = pickFirstValue(userFromState, ["name", "username"]) || headerName;

  return (
    <UserRecordsDetail
      variant="page"
      headerTitle={headerTitle}
      headerUser={headerUser}
      headerId={headerId}
      loading={loading}
      error={error}
      records={records}
      onClose={() => navigate("/admin/users")}
      onRefresh={loadRecords}
    />
  );
}

function UserRecordsDetail({
  variant = "page",
  headerTitle,
  headerUser,
  headerId,
  loading,
  error,
  records,
  onClose,
  onRefresh,
}) {
  const headerName = headerUser?.name || headerUser?.username || "User";
  const headerEmail = headerUser?.email || null;
  const headerPhone = headerUser?.phone || null;
  const headerRole = headerUser?.role || headerUser?.user_role || null;
  const container = (
    <div className="admin-card p-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h4 className="mb-1">User History</h4>
          <div className="admin-muted">
            View subscriptions and bookings for <strong>{headerTitle}</strong>.
          </div>
          <div className="text-muted small">
            {headerEmail && <span className="me-2">{headerEmail}</span>}
            {headerPhone && <span>{headerPhone}</span>}
          </div>
        </div>
        <div className="d-flex gap-2">
          {onClose && (
            <button className="btn btn-outline-light" onClick={onClose}>
              {variant === "modal" ? "Close" : "Back to Users"}
            </button>
          )}
          <button className="btn btn-outline-light" onClick={onRefresh} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card bg-dark text-white border-secondary mb-4">
        <div className="card-body">
          <div className="d-flex flex-wrap justify-content-between gap-3">
            <div>
              <div className="text-muted small">User</div>
              <div className="fw-bold fs-5">{headerName}</div>
              <div className="text-muted small">ID: {headerId}</div>
            </div>
            <div>
              <div className="text-muted small">Contact</div>
              <div>{headerEmail || "-"}</div>
              <div>{headerPhone || "-"}</div>
            </div>
            <div>
              <div className="text-muted small">Role</div>
              <div>{headerRole || "-"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <h5 className="mb-3">Subscriptions</h5>
        {records.subscriptions.length === 0 ? (
          <div className="text-center text-muted py-4">{loading ? "Loading..." : "No records found."}</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-dark table-striped align-middle">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {records.subscriptions.map((subscription) => (
                  <tr key={subscription?.id ?? Math.random()}>
                    <td>{subscription?.id ?? "-"}</td>
                    <td>{subscription?.plan_name || subscription?.package_name || "-"}</td>
                    <td>{statusBadge(subscription?.status)}</td>
                    <td>{subscription?.start_date || "-"}</td>
                    <td>{subscription?.end_date || "-"}</td>
                    <td>{moneyMMK(subscription?.price ?? subscription?.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-4">
        <h5 className="mb-3">Trainer Bookings</h5>
        {records.trainerBookings.length === 0 ? (
          <div className="text-center text-muted py-4">{loading ? "Loading..." : "No records found."}</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-dark table-striped align-middle">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Trainer</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {records.trainerBookings.map((booking) => (
                  <tr key={booking?.id ?? Math.random()}>
                    <td>{booking?.id ?? "-"}</td>
                    <td>{booking?.trainer_name || booking?.trainer?.name || "-"}</td>
                    <td>{booking?.package_name || booking?.trainer_package?.name || "-"}</td>
                    <td>{statusBadge(booking?.status)}</td>
                    <td>{booking?.start_date || "-"}</td>
                    <td>{booking?.end_date || "-"}</td>
                    <td>{moneyMMK(booking?.total_price ?? booking?.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h5 className="mb-3">Boxing Bookings</h5>
        {records.boxingBookings.length === 0 ? (
          <div className="text-center text-muted py-4">{loading ? "Loading..." : "No records found."}</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-dark table-striped align-middle">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Coach</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {records.boxingBookings.map((booking) => (
                  <tr key={booking?.id ?? Math.random()}>
                    <td>{booking?.id ?? "-"}</td>
                    <td>{booking?.coach_name || booking?.coach?.name || "-"}</td>
                    <td>{booking?.package_name || booking?.boxing_package?.name || "-"}</td>
                    <td>{statusBadge(booking?.status)}</td>
                    <td>{booking?.start_date || "-"}</td>
                    <td>{booking?.end_date || "-"}</td>
                    <td>{moneyMMK(booking?.total_price ?? booking?.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  if (variant === "modal") {
    return (
      <>
        <div className="modal fade show d-block" tabIndex="-1">
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content bg-dark text-white">
              <div className="modal-body">{container}</div>
            </div>
          </div>
        </div>
        <div className="modal-backdrop fade show"></div>
      </>
    );
  }

  return container;
}
