import React, { useEffect, useMemo, useRef, useState } from "react";
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
  if (s === "activated") return "active";
  if (s === "on_hold") return "on-hold";  // underscore variant
  if (s === "on hold") return "on-hold";  // space variant
  if (s === "hold") return "on-hold";
  if (s === "cancelled" || s === "canceled") return "on-hold";
  return s;
}

function toBoolean(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === 0) return Boolean(value);
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "active", "activated", "confirmed"].includes(normalized);
}

function displayDate(value) {
  if (!value) return "-";
  const parsed = parseDate(value);
  if (!parsed) return String(value);
  return parsed.toLocaleDateString("en-CA");
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
  subscriptions: {
    active: [],
    onHold: [],
    past: [],
    upcoming: [],
  },
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

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildSubscriptionEntry(source, typeLabel, nameSource) {
  const name =
    typeof nameSource === "string"
      ? nameSource
      : Array.isArray(nameSource)
        ? pickFirstValue(source, nameSource) || "-"
        : "-";
  const startDate =
    source?.start_date ??
    source?.sessions_start_date ??
    source?.month_start_date ??
    source?.startDate ??
    null;
  const endDate =
    source?.end_date ??
    source?.sessions_end_date ??
    source?.month_end_date ??
    source?.endDate ??
    null;
  // Keep status derivation aligned with subscription endpoints that can use different keys.
  const rawStatus = pickFirstValue(source, [
    "status",
    "status_key",
    "state",
    "subscription_status",
    "current_status",
  ]);
  const normalizedRawStatus = normalizeStatus(rawStatus);

  // Backend may expose booleans as true/false, 1/0, or strings.
  const isActiveFlag = [
    source?.is_active,
    source?.isActive,
    source?.active,
    source?.is_activated,
    source?.activated,
    source?.is_confirmed,
  ].some((value) => toBoolean(value));

  const isOnHoldFlag = [source?.is_on_hold, source?.on_hold, source?.onHold].some((value) => toBoolean(value));
  const isExpiredFlag = [source?.is_expired, source?.expired].some((value) => toBoolean(value));

  // If status is explicitly active (or equivalent), or active flag is set, use active.
  let derivedStatus;
  if (normalizedRawStatus === "active" || isActiveFlag) {
    derivedStatus = "active";
  } else if (normalizedRawStatus && normalizedRawStatus !== "pending") {
    derivedStatus = normalizedRawStatus;
  } else if (isExpiredFlag) {
    derivedStatus = "expired";
  } else if (isOnHoldFlag) {
    derivedStatus = "on-hold";
  } else {
    derivedStatus = normalizedRawStatus || "pending";
  }

  return {
    id: source?.id ?? "-",
    type: typeLabel,
    name,
    status: derivedStatus ?? "pending",
    startDate,
    endDate,
    price: source?.price ?? source?.total_price ?? null,
  };
}

function groupSubscriptions(entries) {
  const grouped = {
    active: [],
    onHold: [],
    past: [],
    upcoming: [],
  };
  const now = new Date();

  entries.forEach((entry) => {
    const normalized = normalizeStatus(entry.status);
    const startDate = parseDate(entry.startDate);
    const endDate = parseDate(entry.endDate);

    if (normalized === "expired" || normalized === "completed") {
      grouped.past.push(entry);
      return;
    }

    // "on-hold" status goes to onHold section
    if (normalized === "on-hold") {
      grouped.onHold.push(entry);
      return;
    }

    // Only "active" status goes to active section
    if (normalized === "active") {
      grouped.active.push(entry);
      return;
    }

    if (normalized === "upcoming") {
      grouped.upcoming.push(entry);
      return;
    }

    // Pending rows can still be active if dates indicate current validity.
    if (normalized === "pending" && startDate && endDate && startDate <= now && endDate >= now) {
      grouped.active.push(entry);
      return;
    }

    if (normalized === "pending") {
      grouped.upcoming.push(entry);
      return;
    }

    if (startDate && startDate > now) {
      grouped.upcoming.push(entry);
      return;
    }

    if (endDate && endDate < now) {
      grouped.past.push(entry);
      return;
    }

    // Default to upcoming for any other status
    grouped.upcoming.push(entry);
  });

  return grouped;
}

export default function AdminUserHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const userFromState = location.state?.user ?? location.state?.trainer ?? null;
  const requestRef = useRef(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState(emptyRecords);
  const [userProfile, setUserProfile] = useState(null);

  // Detect if this is a trainer based on URL path or state
  const isTrainer = useMemo(() => {
    const path = location.pathname;
    if (path.includes('/trainers/')) return true;
    const role = userFromState?.role;
    return role === 'trainer' || role === 'Trainer';
  }, [location.pathname, userFromState]);

  // Always prioritize URL param ID (the actual database record ID from the route)
  const recordId = useMemo(() => {
    // URL param is the source of truth (from route /admin/users/:id/history)
    if (id) return String(id);
    
    // Fallback: try to extract from state if URL param is missing
    const fallbacks = [
      userFromState?.id,
      userFromState?.user?.id,
      userFromState?.users?.id,
      userFromState?.member?.id,
      userFromState?.profile?.id,
      userFromState?.users_id,
      userFromState?.user_record_id,
      userFromState?.record_id,
      userFromState?.member_id,
    ];
    
    for (const candidate of fallbacks) {
      if (candidate !== null && candidate !== undefined && candidate !== "") {
        return String(candidate);
      }
    }
    
    return null;
  }, [id, userFromState]);

  const loadRecords = async () => {
    if (!recordId) {
      setRecords(emptyRecords);
      setUserProfile(null);
      setError("Missing users.id for this record.");
      return;
    }
    
    console.log("[AdminUserHistory] Loading records for user ID:", recordId);
    console.log("[AdminUserHistory] URL param 'id':", id);
    console.log("[AdminUserHistory] userFromState:", userFromState);
    
    setError(null);
    setLoading(true);
    requestRef.current += 1;
    const requestId = requestRef.current;
    try {
      let res;
      try {
        console.log("[AdminUserHistory] Trying GET /user/" + recordId + "/records");
        res = await axiosClient.get(`/user/${recordId}/records`);
      } catch (primaryErr) {
        if (primaryErr?.response?.status !== 404) throw primaryErr;
        console.log("[AdminUserHistory] Fallback to GET /users/" + recordId + "/records");
        res = await axiosClient.get(`/users/${recordId}/records`);
      }
      const payload = res?.data || {};
      console.log("[AdminUserHistory] API response payload:", payload);
      
      if (requestId === requestRef.current) {
        setUserProfile(payload?.user ?? null);
        const subscriptions = normalizeArray(payload.subscriptions);
        const trainerBookings = normalizeArray(payload.trainer_bookings ?? payload.trainerbookings);
        const boxingBookings = normalizeArray(payload.boxing_bookings ?? payload.boxingbookings);
        const entries = [
          ...subscriptions.map((item) =>
            buildSubscriptionEntry(item, "Subscription", ["plan_name", "package_name", "name"]),
          ),
          ...trainerBookings.map((item) =>
            buildSubscriptionEntry(
              item,
              "Trainer Package",
              item?.package_name || item?.trainer_package?.name || item?.name,
            ),
          ),
          ...boxingBookings.map((item) =>
            buildSubscriptionEntry(
              item,
              "Boxing Package",
              item?.package_name || item?.boxing_package?.name || item?.name,
            ),
          ),
        ];
        setRecords({
          subscriptions: groupSubscriptions(entries),
        });
      }
    } catch (err) {
      console.error("[AdminUserHistory] Error loading records:", err);
      if (requestId === requestRef.current) {
        setRecords(emptyRecords);
        setUserProfile(null);
        setError(buildErrorMessage(err));
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setRecords(emptyRecords);
    setUserProfile(null);
    loadRecords();
  }, [recordId]);

  return (
    <UserRecordsDetail
      variant="page"
      loading={loading}
      error={error}
      records={records}
      userProfile={userProfile}
      isTrainer={isTrainer}
      onClose={() => navigate(isTrainer ? "/admin/users" : "/admin/users")}
      onRefresh={loadRecords}
    />
  );
}

function UserRecordsDetail({
  variant = "page",
  loading,
  error,
  records,
  userProfile,
  isTrainer = false,
  onClose,
  onRefresh,
}) {
  const subscriptionGroups = records?.subscriptions ?? emptyRecords.subscriptions;
  const renderTable = (items) => {
    if (items.length === 0) {
      return <div className="text-center text-muted py-4">No subscriptions found for this category.</div>;
    }

    return (
      <div className="table-responsive">
        <table className="table table-dark table-striped align-middle">
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Plan / Package</th>
              <th>Status</th>
              <th>Start</th>
              <th>End</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {items.map((subscription) => (
              <tr key={subscription?.id ?? Math.random()}>
                <td>{subscription?.id ?? "-"}</td>
                <td>{subscription?.type ?? "-"}</td>
                <td>{subscription?.name ?? "-"}</td>
                <td>{statusBadge(subscription?.status)}</td>
                <td>{displayDate(subscription?.startDate)}</td>
                <td>{displayDate(subscription?.endDate)}</td>
                <td>{moneyMMK(subscription?.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const container = (
    <div className="admin-card p-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h4 className="mb-1">{isTrainer ? "Trainer History" : "User History"}</h4>
          <div className="admin-muted">
            {isTrainer
              ? "View trainer profile, assigned bookings, and attendance history."
              : "View user profile, subscriptions, and booking history."}
          </div>
          {loading && <div className="text-muted small">Loading {isTrainer ? "records" : "subscriptions"}...</div>}
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

      {userProfile && (
        <div className="card bg-dark text-white border-secondary mb-4">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-3 col-sm-6">
                <div className="text-muted small">Name</div>
                <div className="fw-semibold">{userProfile?.name || "-"}</div>
              </div>
              <div className="col-md-3 col-sm-6">
                <div className="text-muted small">Email</div>
                <div>{userProfile?.email || "-"}</div>
              </div>
              <div className="col-md-3 col-sm-6">
                <div className="text-muted small">Phone</div>
                <div>{userProfile?.phone || "-"}</div>
              </div>
              <div className="col-md-3 col-sm-6">
                <div className="text-muted small">Role</div>
                <div className="text-capitalize">
                  {isTrainer ? (
                    <span className="badge bg-info text-dark">Trainer</span>
                  ) : (
                    userProfile?.role || "-"
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card bg-dark text-white border-secondary mb-4">
        <div className="card-body">
          <div className="d-flex flex-wrap justify-content-between gap-3">
            <div>
              <div className="text-muted small">Summary</div>
              <div className="fw-bold fs-5">
                {isTrainer ? "Trainer Booking Records" : "Subscription & Package Records"}
              </div>
              <div className="text-muted small">
                Total: {subscriptionGroups.active.length + subscriptionGroups.onHold.length + subscriptionGroups.upcoming.length + subscriptionGroups.past.length}
                {isTrainer && (
                  <> · Active: {subscriptionGroups.active.length} · On Hold: {subscriptionGroups.onHold.length} · Upcoming: {subscriptionGroups.upcoming.length} · Completed: {subscriptionGroups.past.length}</>
                )}
                {!isTrainer && (
                  <> · Active: {subscriptionGroups.active.length} · On Hold: {subscriptionGroups.onHold.length} · Upcoming: {subscriptionGroups.upcoming.length} · Past: {subscriptionGroups.past.length}</>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <h5 className="mb-3">{isTrainer ? "Active Bookings" : "Active Subscriptions"}</h5>
        {loading && subscriptionGroups.active.length === 0 ? (
          <div className="text-center text-muted py-4">Loading...</div>
        ) : (
          renderTable(subscriptionGroups.active)
        )}
      </div>

      <div className="mb-4">
        <h5 className="mb-3">{isTrainer ? "On Hold Bookings" : "On Hold Subscriptions"}</h5>
        {loading && subscriptionGroups.onHold.length === 0 ? (
          <div className="text-center text-muted py-4">Loading...</div>
        ) : (
          renderTable(subscriptionGroups.onHold)
        )}
      </div>

      <div className="mb-4">
        <h5 className="mb-3">{isTrainer ? "Completed / Past Bookings" : "Expired / Past Subscriptions"}</h5>
        {loading && subscriptionGroups.past.length === 0 ? (
          <div className="text-center text-muted py-4">Loading...</div>
        ) : (
          renderTable(subscriptionGroups.past)
        )}
      </div>

      <div>
        <h5 className="mb-3">{isTrainer ? "Upcoming / Pending Bookings" : "Upcoming / Pre-purchased Subscriptions"}</h5>
        {loading && subscriptionGroups.upcoming.length === 0 ? (
          <div className="text-center text-muted py-4">Loading...</div>
        ) : (
          renderTable(subscriptionGroups.upcoming)
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
