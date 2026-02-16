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
  if (s === "cancelled" || s === "canceled") return "on-hold";
  if (s === "hold") return "on-hold";
  if (s === "completed" || s === "complete" || s === "done") return "completed";
  return s;
}

function displayDate(value) {
  if (!value) return "-";
  const parsed = parseDate(value);
  if (!parsed) return String(value);
  return parsed.toLocaleDateString("en-CA");
}

function displayDateTime(value) {
  if (!value) return "-";
  const parsed = parseDate(value);
  if (!parsed) return String(value);
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "active") return <span className="badge bg-success">Active</span>;
  if (normalized === "completed") return <span className="badge bg-primary">Completed</span>;
  if (normalized === "on-hold") return <span className="badge bg-warning text-dark">On Hold</span>;
  if (normalized === "expired") return <span className="badge bg-secondary">Expired</span>;
  if (normalized === "pending") return <span className="badge bg-info text-dark">Pending</span>;
  if (normalized === "cancelled" || normalized === "canceled") 
    return <span className="badge bg-danger">Cancelled</span>;
  return <span className="badge bg-secondary">{normalized}</span>;
}

const emptyRecords = {
  bookings: {
    active: [],
    completed: [],
    upcoming: [],
  },
  attendance: [],
};

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickArray(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function buildErrorMessage(error) {
  const status = error?.response?.status;
  if (status === 404) return "Trainer not found.";
  if (status === 500) return "Server error. Please try again.";
  return error?.response?.data?.message || "Failed to load trainer records.";
}

function parseDate(value) {
  if (!value) return null;
  const normalized = String(value).includes("T") ? value : String(value).replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildBookingEntry(source) {
  // Member/Client name - try various field names
  const memberName = 
    source?.member_name ||
    source?.user?.name ||
    source?.member?.name ||
    source?.client_name ||
    source?.customer_name ||
    "-";
  
  // Member phone
  const memberPhone = 
    source?.member_phone ||
    source?.user?.phone ||
    source?.member?.phone ||
    source?.client_phone ||
    null;
  
  // Package name
  const packageName =
    source?.trainer_package?.name ||
    source?.package_name ||
    source?.package?.name ||
    source?.name ||
    "-";

  // Package type (personal, monthly, duo, etc.)
  const packageType = 
    source?.trainer_package?.package_type ||
    source?.package_type ||
    source?.type ||
    "-";

  // Dates
  const startDate =
    source?.start_date ??
    source?.sessions_start_date ??
    source?.month_start_date ??
    source?.startDate ??
    source?.created_at ??
    null;

  const endDate =
    source?.end_date ??
    source?.sessions_end_date ??
    source?.month_end_date ??
    source?.endDate ??
    null;

  // Sessions
  const sessionsTotal = 
    source?.sessions_count ?? 
    source?.session_count ?? 
    source?.sessions ?? 
    source?.trainer_package?.sessions_count ??
    null;
  const sessionsRemaining = 
    source?.sessions_remaining ?? 
    source?.remaining_sessions ?? 
    null;
  const sessionsUsed = 
    source?.sessions_used ?? 
    source?.sessions_completed ?? 
    null;

  // Price
  const price = 
    source?.total_price ?? 
    source?.price ?? 
    source?.amount ??
    null;

  // Paid status
  const paidStatus = source?.paid_status ?? source?.is_paid ?? null;

  return {
    id: source?.id ?? "-",
    memberName,
    memberPhone,
    packageName,
    packageType,
    status: source?.status ?? "pending",
    startDate,
    endDate,
    price,
    sessionsTotal,
    sessionsRemaining,
    sessionsUsed,
    paidStatus,
    notes: source?.notes ?? source?.note ?? null,
    trainerId:
      source?.trainer_id ??
      source?.trainer?.id ??
      source?.trainer_user_id ??
      source?.trainer?.user_id ??
      null,
  };
}

function groupBookings(entries) {
  const grouped = {
    active: [],
    completed: [],
    upcoming: [],
  };
  const now = new Date();

  entries.forEach((entry) => {
    const normalized = normalizeStatus(entry.status);
    const startDate = parseDate(entry.startDate);
    const endDate = parseDate(entry.endDate);

    if (normalized === "completed" || normalized === "done") {
      grouped.completed.push(entry);
      return;
    }

    if (normalized === "expired" || normalized === "on-hold") {
      grouped.completed.push(entry);
      return;
    }

    if (normalized === "pending" || normalized === "upcoming") {
      grouped.upcoming.push(entry);
      return;
    }

    if (startDate && startDate > now) {
      grouped.upcoming.push(entry);
      return;
    }

    if (endDate && endDate < now) {
      grouped.completed.push(entry);
      return;
    }

    grouped.active.push(entry);
  });

  return grouped;
}

export default function AdminTrainerHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const trainerFromState = location.state?.trainer ?? location.state?.user ?? null;
  const requestRef = useRef(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState(emptyRecords);
  const [trainerProfile, setTrainerProfile] = useState(null);

  // Always prioritize URL param ID (the actual database record ID from the route)
  const recordId = useMemo(() => {
    // URL param is the source of truth (from route /admin/trainers/:id/history)
    if (id) return String(id);
    
    // Fallback: try to extract from state if URL param is missing
    const fallbacks = [
      trainerFromState?.id,
      trainerFromState?.user?.id,
      trainerFromState?.trainer?.id,
      trainerFromState?.trainer_id,
      trainerFromState?.profile?.id,
    ];
    
    for (const candidate of fallbacks) {
      if (candidate !== null && candidate !== undefined && candidate !== "") {
        return String(candidate);
      }
    }
    
    return null;
  }, [id, trainerFromState]);

  const loadRecords = async () => {
    if (!recordId) {
      setRecords(emptyRecords);
      setTrainerProfile(null);
      setError("Missing trainer ID for this record.");
      return;
    }

    setError(null);
    setLoading(true);
    requestRef.current += 1;
    const requestId = requestRef.current;

    try {
      let payload = null;
      try {
        // Try the correct endpoint first: /users/{id}/records
        const res = await axiosClient.get(`/users/${recordId}/records`);
        payload = res?.data || null;
      } catch (primaryErr) {
        if (primaryErr?.response?.status !== 404) throw primaryErr;
        // Fallback to /user/{id}/records (without 's')
        const fallbackRes = await axiosClient.get(`/user/${recordId}/records`);
        payload = fallbackRes?.data || null;
      }

      let trainerBookings = pickArray(payload, ["trainer_bookings", "bookings", "trainerBookings", "data"]);
      let attendanceRecords = pickArray(payload, ["attendance", "attendance_records", "records"]);

      const profileFromPayload = payload?.trainer ?? payload?.user ?? payload?.profile ?? null;
      if (profileFromPayload) {
        setTrainerProfile(profileFromPayload);
      } else if (trainerFromState) {
        setTrainerProfile(trainerFromState);
      }

      // If no trainer bookings from user records endpoint, try fetching from trainer-bookings endpoint
      if (!trainerBookings.length) {
        try {
          const tbRes = await axiosClient.get(`/trainer-bookings?trainer_id=${recordId}`);
          const tbData = tbRes?.data;
          trainerBookings = pickArray(tbData, ["bookings", "trainer_bookings", "data", "records"]);
          if (!trainerBookings.length) {
            trainerBookings = normalizeArray(tbData);
          }
        } catch {
          // Try alternative endpoint without query param
        }
      }

      // If still no bookings, fetch all and filter by trainer
      if (!trainerBookings.length) {
        try {
          const tbRes2 = await axiosClient.get(`/trainer-bookings`);
          const tbData2 = tbRes2?.data;
          const allBookings = pickArray(tbData2, ["bookings", "trainer_bookings", "data", "records"]);
          const normalizedAll = allBookings.length ? allBookings : normalizeArray(tbData2);

          // Filter bookings for this trainer - check multiple possible ID fields
          trainerBookings = normalizedAll.filter(b => {
            const bookingTrainerId =
              b?.trainer_id ??
              b?.trainer?.id ??
              b?.trainer_user_id ??
              b?.trainer?.user_id ??
              null;
            // Also try matching by trainer name if ID matching fails
            const trainerName = b?.trainer_name ?? b?.trainer?.name ?? "";
            const stateTrainerName = trainerFromState?.name ?? "";
            const idMatch = String(bookingTrainerId) === String(recordId);
            const nameMatch = stateTrainerName && trainerName &&
              trainerName.toLowerCase() === stateTrainerName.toLowerCase();
            return idMatch || nameMatch;
          });
        } catch {
          // No fallback available
        }
      }

      if (!attendanceRecords.length) {
        const attendanceEndpoints = [
          `/attendance/trainer/${recordId}`,
          `/trainer/${recordId}/attendance`,
          `/attendance?trainer_id=${recordId}`,
        ];
        for (const endpoint of attendanceEndpoints) {
          try {
            const attRes = await axiosClient.get(endpoint);
            attendanceRecords = pickArray(attRes?.data, ["records", "attendance", "data"]);
            if (!attendanceRecords.length) {
              attendanceRecords = normalizeArray(attRes?.data);
            }
            if (attendanceRecords.length) break;
          } catch {
            // continue trying alternate attendance endpoints
          }
        }
      }

      if (requestId === requestRef.current) {
        const bookingEntries = trainerBookings.map(buildBookingEntry);

        setRecords({
          bookings: groupBookings(bookingEntries),
          attendance: attendanceRecords.slice(0, 20), // Last 20 attendance records
        });
      }
    } catch (err) {
      if (requestId === requestRef.current) {
        setRecords(emptyRecords);
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
    setTrainerProfile(null);
    loadRecords();
  }, [recordId]);

  return (
    <TrainerRecordsDetail
      variant="page"
      loading={loading}
      error={error}
      records={records}
      trainerProfile={trainerProfile}
      onClose={() => navigate("/admin/users")}
      onRefresh={loadRecords}
    />
  );
}

function TrainerRecordsDetail({
  variant = "page",
  loading,
  error,
  records,
  trainerProfile,
  onClose,
  onRefresh,
}) {
  const bookingGroups = records?.bookings ?? emptyRecords.bookings;
  const attendanceRecords = records?.attendance ?? [];

  const renderBookingsTable = (items) => {
    if (items.length === 0) {
      return <div className="text-center text-muted py-4">No bookings found for this category.</div>;
    }

    return (
      <div className="table-responsive">
        <table className="table table-dark table-striped align-middle">
          <thead>
            <tr>
              <th>ID</th>
              <th>Member</th>
              <th>Phone</th>
              <th>Package</th>
              <th>Type</th>
              <th>Status</th>
              <th>Paid</th>
              <th>Sessions</th>
              <th>Start</th>
              <th>End</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {items.map((booking) => {
              const sessionsDisplay = booking.sessionsTotal
                ? `${booking.sessionsRemaining ?? booking.sessionsTotal} / ${booking.sessionsTotal}`
                : "-";

              const paidBadge = () => {
                const paid = String(booking?.paidStatus || "").toLowerCase();
                if (paid === "paid" || paid === "1" || paid === "true") {
                  return <span className="badge bg-success">Paid</span>;
                }
                if (paid === "unpaid" || paid === "0" || paid === "false") {
                  return <span className="badge bg-warning text-dark">Unpaid</span>;
                }
                return <span className="badge bg-secondary">-</span>;
              };

              return (
                <tr key={booking?.id ?? Math.random()}>
                  <td>{booking?.id ?? "-"}</td>
                  <td>{booking?.memberName ?? "-"}</td>
                  <td>{booking?.memberPhone ?? "-"}</td>
                  <td>{booking?.packageName ?? "-"}</td>
                  <td className="text-capitalize">{booking?.packageType ?? "-"}</td>
                  <td>{statusBadge(booking?.status)}</td>
                  <td>{paidBadge()}</td>
                  <td>{sessionsDisplay}</td>
                  <td>{displayDate(booking?.startDate)}</td>
                  <td>{displayDate(booking?.endDate)}</td>
                  <td>{moneyMMK(booking?.price)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderAttendanceTable = () => {
    if (attendanceRecords.length === 0) {
      return <div className="text-center text-muted py-4">No attendance records found.</div>;
    }

    return (
      <div className="table-responsive">
        <table className="table table-dark table-striped align-middle">
          <thead>
            <tr>
              <th>ID</th>
              <th>Action</th>
              <th>Date/Time</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            {attendanceRecords.map((record) => (
              <tr key={record?.id ?? Math.random()}>
                <td>{record?.id ?? "-"}</td>
                <td>
                  <span className={`badge ${
                    String(record?.action || record?.type || "").toLowerCase().includes("in") 
                      ? "bg-success" 
                      : "bg-warning text-dark"
                  }`}>
                    {record?.action ?? record?.type ?? "-"}
                  </span>
                </td>
                <td>{displayDateTime(record?.timestamp ?? record?.scanned_at ?? record?.created_at)}</td>
                <td className="text-capitalize">{record?.method ?? record?.scan_type ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const totalActive = bookingGroups.active.length;
  const totalCompleted = bookingGroups.completed.length;
  const totalUpcoming = bookingGroups.upcoming.length;
  const totalBookings = totalActive + totalCompleted + totalUpcoming;

  const container = (
    <div className="admin-card p-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h4 className="mb-1">Trainer History</h4>
          <div className="admin-muted">View trainer profile, assigned bookings, and attendance history.</div>
          {loading && <div className="text-muted small">Loading records...</div>}
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

      {trainerProfile && (
        <div className="card bg-dark text-white border-secondary mb-4">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-3 col-sm-6">
                <div className="text-muted small">Name</div>
                <div className="fw-semibold">{trainerProfile?.name || "-"}</div>
              </div>
              <div className="col-md-3 col-sm-6">
                <div className="text-muted small">Email</div>
                <div>{trainerProfile?.email || "-"}</div>
              </div>
              <div className="col-md-3 col-sm-6">
                <div className="text-muted small">Phone</div>
                <div>{trainerProfile?.phone || "-"}</div>
              </div>
              <div className="col-md-3 col-sm-6">
                <div className="text-muted small">Role</div>
                <div className="text-capitalize">
                  <span className="badge bg-info text-dark">{trainerProfile?.role || "Trainer"}</span>
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
              <div className="fw-bold fs-5">Trainer Booking Records</div>
              <div className="text-muted small">
                Total: {totalBookings} · Active: {totalActive} · Upcoming: {totalUpcoming} · Completed: {totalCompleted}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <h5 className="mb-3">Active Bookings</h5>
        {loading && bookingGroups.active.length === 0 ? (
          <div className="text-center text-muted py-4">Loading...</div>
        ) : (
          renderBookingsTable(bookingGroups.active)
        )}
      </div>

      <div className="mb-4">
        <h5 className="mb-3">Completed / Past Bookings</h5>
        {loading && bookingGroups.completed.length === 0 ? (
          <div className="text-center text-muted py-4">Loading...</div>
        ) : (
          renderBookingsTable(bookingGroups.completed)
        )}
      </div>

      <div className="mb-4">
        <h5 className="mb-3">Upcoming / Pending Bookings</h5>
        {loading && bookingGroups.upcoming.length === 0 ? (
          <div className="text-center text-muted py-4">Loading...</div>
        ) : (
          renderBookingsTable(bookingGroups.upcoming)
        )}
      </div>

      <div>
        <h5 className="mb-3">
          <span className="badge bg-secondary me-2">{attendanceRecords.length}</span>
          Recent Attendance Records
        </h5>
        {loading && attendanceRecords.length === 0 ? (
          <div className="text-center text-muted py-4">Loading...</div>
        ) : (
          renderAttendanceTable()
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
