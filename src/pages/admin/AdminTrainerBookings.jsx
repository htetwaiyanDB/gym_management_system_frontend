import React, { useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";

function moneyMMK(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-US") + " MMK";
}

function parseBackendDateTime(s) {
  // backend: "YYYY-MM-DD HH:mm:ss" (or null)
  if (!s) return null;
  // Convert to ISO-ish for JS parsing
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateTimeVideoStyle(s) {
  // "2026-01-11 10:30 AM"
  const d = parseBackendDateTime(s);
  if (!d) return "-";

  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());

  let hours = d.getHours();
  const minutes = pad2(d.getMinutes());
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${y}-${m}-${day} ${hours}:${minutes} ${ampm}`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function isCompletedStatus(value) {
  const s = String(value || "").toLowerCase();
  return s.includes("complete") || s.includes("completed") || s.includes("done");
}

function normalizeBookingStatus(value) {
  const s = String(value || "").toLowerCase();
  if (s === "confirmed") return "active";
  if (s === "cancelled" || s === "canceled") return "on-hold";
  if (s === "hold" || s === "on-hold") return "on-hold";
  if (s === "completed" || s === "complete" || s === "done") return "completed";
  return s || "pending";
}


function getSessionProgress(booking) {
  const total = toNumber(booking?.sessions_count ?? booking?.session_count ?? booking?.sessions);
  const remaining =
    toNumber(booking?.sessions_remaining ?? booking?.remaining_sessions ?? booking?.sessions_left);
  const used = toNumber(booking?.sessions_used ?? booking?.sessions_completed ?? booking?.used_sessions);

  if (total === null) return { total: null, remaining: null };

  if (remaining !== null) {
    return { total, remaining: Math.max(0, remaining) };
  }

  if (used !== null) {
    return { total, remaining: Math.max(0, total - used) };
  }

   if (isCompletedStatus(booking?.status) && total !== null) {
    return { total, remaining: 0 };
  }


  return { total, remaining: total };
}

function getMonthCount(booking) {
  const monthValue =
    booking?.trainer_package?.duration_months ??
    booking?.duration_months ??
    booking?.month_count ??
    booking?.months_count;
  return toNumber(monthValue);
}


export default function AdminTrainerBookings() {
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [msg, setMsg] = useState(null);

  const [bookings, setBookings] = useState([]);

  // options for create modal
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [packageTypeOptions, setPackageTypeOptions] = useState(["personal", "monthly", "duo"]);
  const [trainerPackages, setTrainerPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
   const [statusOptions, setStatusOptions] = useState([
    "pending",
    "active",
    "on-hold",
    "completed",
  ]);
  const [paidOptions, setPaidOptions] = useState(["unpaid", "paid"]);
  const [defaultPrice, setDefaultPrice] = useState(30000);

  // filters
  const [filterPaid, setFilterPaid] = useState("all");     // all | paid | unpaid
  const [filterStatus, setFilterStatus] = useState("all"); // all | pending | active | on-hold | completed
  const [searchTerm, setSearchTerm] = useState("");
  // modal
  const [showModal, setShowModal] = useState(false);

  // form fields
  const [memberId, setMemberId] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [packageType, setPackageType] = useState("");
  const [packageGroup, setPackageGroup] = useState("");
  const [priceSource, setPriceSource] = useState("package"); // package | manual
  const [sessionsCount, setSessionsCount] = useState("1");
  const [pricePerSession, setPricePerSession] = useState("");
  const [status, setStatus] = useState("pending");
  const [paidStatus, setPaidStatus] = useState("unpaid");
  const [notes, setNotes] = useState("");

 const packageKey = (pkg) =>
    String(pkg?.id ?? pkg?.package_id ?? pkg?.packageId ?? pkg?.type ?? pkg?.name ?? "");

  const normalizePackageType = (value) => String(value || "").toLowerCase();

  const findSelectedPackage = (list = trainerPackages, selected = packageType) =>
    list.find((pkg) => packageKey(pkg) === selected);

  const getPackageId = (pkg) => {
    const value = pkg?.id ?? pkg?.package_id ?? pkg?.packageId ?? "";
    const numeric = Number(value);
    return Number.isNaN(numeric) ? null : numeric;
  };

  const resetForm = () => {
    setMemberId("");
    setTrainerId("");
    setPackageType("");
    setPackageGroup("");
    setSessionsCount("1");
    setPricePerSession(""); // will set default on options load
    setPriceSource("package");
    setStatus("pending");
    setPaidStatus("unpaid");
    setNotes("");
  };

  const total = useMemo(() => {
    const s = Number(sessionsCount);
    const p = Number(pricePerSession || defaultPrice);
    if (Number.isNaN(s) || Number.isNaN(p)) return 0;
    return Math.max(0, s) * Math.max(0, p);
  }, [sessionsCount, pricePerSession, defaultPrice]);

  const loadBookings = async () => {
    setMsg(null);
    setLoading(true);
    try {
      const res = await axiosClient.get("/trainer-bookings");
      const list = Array.isArray(res.data?.bookings) ? res.data.bookings : [];
      setBookings(list);
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to load trainer bookings.",
      });
    } finally {
      setLoading(false);
    }
  };

    const loadTrainerPackages = async () => {
    setPackagesLoading(true);
    try {
      const res = await axiosClient.get("/trainer-packages");
      const list =
        res.data?.packages ??
        res.data?.trainer_packages ??
        res.data?.data ??
        res.data ??
        [];
      const normalized = Array.isArray(list) ? list : [];
      setTrainerPackages(normalized);

      if (packageType && priceSource === "package") {
        const selected = findSelectedPackage(normalized);
        const nextPrice = Number(
          selected?.price_per_session ?? selected?.price ?? selected?.amount ?? NaN
        );
        if (!Number.isNaN(nextPrice)) {
          setPricePerSession(String(nextPrice));
        }
      }
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to load trainer packages.",
      });
    } finally {
      setPackagesLoading(false);
    }
  };


  const openCreateModal = async () => {
    setMsg(null);
    setShowModal(true);
    resetForm();

    setOptionsLoading(true);
    try {
      const res = await axiosClient.get("/trainer-bookings/options");
      setMembers(Array.isArray(res.data?.members) ? res.data.members : []);
      setTrainers(Array.isArray(res.data?.trainers) ? res.data.trainers : []);
      setPackageTypeOptions(
        Array.isArray(res.data?.package_types) && res.data.package_types.length > 0
          ? res.data.package_types
          : ["personal", "monthly", "duo"]
      );
      setDefaultPrice(Number(res.data?.default_price_per_session ?? 30000));
      setStatusOptions(
        Array.isArray(res.data?.status_options)
          ? res.data.status_options
          : ["pending", "active", "on-hold", "completed"]
      );
      setPaidOptions(Array.isArray(res.data?.paid_status_options) ? res.data.paid_status_options : ["unpaid", "paid"]);

      // default in UI
      setPricePerSession(String(res.data?.default_price_per_session ?? 30000));
      setPriceSource("package");
      setStatus("pending");
      setPaidStatus("unpaid");
      setPackageType("");
      setPackageGroup("");
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to load booking options.",
      });
    } finally {
      setOptionsLoading(false);
    }
  };

  const createBooking = async () => {
    setMsg(null);

    if (!memberId) return setMsg({ type: "danger", text: "Please select a member." });
    if (!trainerId) return setMsg({ type: "danger", text: "Please select a trainer." });
    if (!packageType) return setMsg({ type: "danger", text: "Please select a package type." });

    const sessions = Number(sessionsCount);
    const price = Number(pricePerSession);

    if (Number.isNaN(sessions) || sessions <= 0) return setMsg({ type: "danger", text: "Sessions must be a valid number." });
    if (Number.isNaN(price) || price < 0) return setMsg({ type: "danger", text: "Price per session must be valid." });

    setBusyKey("create");
    try {
  
      const selectedPackage = findSelectedPackage();
      if (trainerPackages.length > 0 && !selectedPackage) {
        setBusyKey(null);
        return setMsg({ type: "danger", text: "Please select a package from the list." });
      }
      const selectedPackageId = getPackageId(selectedPackage);
      const payload = {
        member_id: Number(memberId),
        trainer_id: Number(trainerId),
        trainer_package_id: selectedPackageId ?? undefined,
        package_type:
          selectedPackage?.package_type ??
          selectedPackage?.type ??
          selectedPackage?.packageType ??
          packageType,
        sessions_count: sessions,
        price_per_session: price,
        status,
        paid_status: paidStatus,
        notes: notes || null,
      };

      const res = await axiosClient.post("/trainer-bookings", payload);

      setShowModal(false);
      setMsg({ type: "success", text: res?.data?.message || "Booking created successfully." });
      await loadBookings();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to create booking.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const markActive = async (id) => {
    setMsg(null);
    setBusyKey(`active-${id}`);
    try {
      const res = await axiosClient.patch(`/trainer-bookings/${id}/mark-active`);
      setMsg({ type: "success", text: res?.data?.message || "Marked as active." });
      await loadBookings();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to mark as active.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const markPaid = async (id) => {
    setMsg(null);
    setBusyKey(`paid-${id}`);
    try {
      const res = await axiosClient.patch(`/trainer-bookings/${id}/mark-paid`);
      setMsg({ type: "success", text: res?.data?.message || "Marked as paid." });
      await loadBookings();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to mark as paid.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const markHold = async (id) => {
    setMsg(null);
    setBusyKey(`hold-${id}`);
    try {
      const res = await axiosClient.patch(`/trainer-bookings/${id}/mark-hold`);
      setMsg({ type: "success", text: res?.data?.message || "Moved to on-hold." });
      await loadBookings();
    } catch (e) {
      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to mark as pending.",
      });
    } finally {
      setBusyKey(null);
    }
  };


  useEffect(() => {
    loadBookings();
  }, []);

  useEffect(() => {
    if (!showModal) return undefined;
    loadTrainerPackages();
    const interval = setInterval(loadTrainerPackages, 15000);
    return () => clearInterval(interval);
  }, [showModal]);

  const selectedPackage = useMemo(() => findSelectedPackage(), [packageType, trainerPackages]);
  const selectedPackageCount =
    selectedPackage?.duration_months ?? selectedPackage?.sessions_count ?? "";
  const countLabel = selectedPackage?.duration_months ? "Month Count" : "Session Count";

  useEffect(() => {
    if (!packageType) return;
    if (priceSource !== "package") return;
    const selectedPrice = Number(
       selectedPackage?.price_per_session ?? selectedPackage?.price ?? selectedPackage?.amount ?? NaN
    );
    if (!Number.isNaN(selectedPrice)) {
      setPricePerSession(String(selectedPrice));
    }
   if (selectedPackageCount) {
      setSessionsCount(String(selectedPackageCount));
    }
  }, [packageType, priceSource, selectedPackage, selectedPackageCount]);

    const packagesByType = useMemo(() => {
    if (!Array.isArray(trainerPackages)) {
      return { personal: [], monthly: [], duo: [] };
    }
    return {
      personal: trainerPackages.filter(
        (pkg) => normalizePackageType(pkg?.package_type ?? pkg?.type) === "personal"
      ),
      monthly: trainerPackages.filter(
        (pkg) => normalizePackageType(pkg?.package_type ?? pkg?.type) === "monthly"
      ),
      duo: trainerPackages.filter(
        (pkg) => normalizePackageType(pkg?.package_type ?? pkg?.type) === "duo"
      ),
    };
  }, [trainerPackages]);

  const handlePackageSelect = (group) => (event) => {
    const value = event.target.value;
    setPackageType(value);
    setPackageGroup(value ? group : "");
    setPriceSource("package");
  };

  const renderPackageOptions = (packages, fallbackLabel) =>
    packages.length > 0 ? (
      packages.map((pkg) => {
        const key = packageKey(pkg);
        const label =
          pkg?.name ||
          pkg?.title ||
          (pkg?.sessions_count ? `${pkg.sessions_count} Sessions` : null) ||
          (pkg?.duration_months ? `${pkg.duration_months} Months` : null) ||
          (pkg?.id ? `Package #${pkg.id}` : "Package");
        const priceLabel = moneyMMK(pkg?.price_per_session ?? pkg?.price ?? pkg?.amount);
        return (
          <option key={key} value={key}>
            {label} {priceLabel !== "-" ? `- ${priceLabel}` : ""}
          </option>
        );
      })
    ) : (
      <option value="" disabled>
        No {fallbackLabel} packages
      </option>
    );


  const statusBadge = (s) => {
    const v = normalizeBookingStatus(s);
    if (v === "active") {
      return <span className="badge bg-info text-dark">Active</span>;
    }
    if (v === "on-hold") {
      return <span className="badge bg-secondary">On Hold</span>;
    }
    if (v === "completed") {
      return <span className="badge bg-success">Completed</span>;
    }
    return <span className="badge bg-warning text-dark">Pending</span>;
  };

  const paidBadge = (s) => {
    const v = String(s || "").toLowerCase();
    if (v === "paid") return <span className="badge bg-success">Paid</span>;
    return <span className="badge bg-danger">Unpaid</span>;
  };

  const getBookingPriority = (booking) => {
    const statusValue = normalizeBookingStatus(booking?.status);
    const { total, remaining } = getSessionProgress(booking);
    const isCompleted = (total !== null && remaining === 0) || isCompletedStatus(booking?.status);
    if (isCompleted || statusValue === "completed") return 2;
    if (statusValue === "active") return 0;
    return 1;
  };

  // ✅ filter + sort (active first, completed last)
  const filteredBookings = useMemo(() => {
    const paidF = String(filterPaid).toLowerCase();
    const statusF = String(filterStatus).toLowerCase();
    const searchValue = String(searchTerm || "").trim().toLowerCase();

    const list = bookings.filter((b) => {
      const paid = String(b?.paid_status || "").toLowerCase();
      const st = normalizeBookingStatus(b?.status);

      if (paidF !== "all" && paid !== paidF) return false;
      if (statusF !== "all" && st !== statusF) return false;
      if (searchValue) {
        const fields = [
          b?.member_name,
          b?.member_phone,
          b?.trainer_name,
          b?.trainer_phone,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        if (!fields.some((value) => value.includes(searchValue))) {
          return false;
        }
      }
      return true;
    });

    // sort by status priority then session_datetime desc
    list.sort((a, b) => {
      const priorityDiff = getBookingPriority(a) - getBookingPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      const da = parseBackendDateTime(a?.session_datetime)?.getTime() ?? 0;
      const db = parseBackendDateTime(b?.session_datetime)?.getTime() ?? 0;
      return db - da;
    });

    return list;
  }, [bookings, filterPaid, filterStatus, searchTerm]);

  return (
    <div className="admin-card p-4">
            <style>
        {`
          .admin-select-dark {
            background-color: #212529;
            color: #f8f9fa;
            border-color: #495057;
          }
          .admin-select-dark:focus {
            background-color: #212529;
            color: #f8f9fa;
            border-color: #6c757d;
          }
          .admin-select-dark option {
            color: #212529;
          }
          .admin-search-input {
            background-color: #212529;
            color: #f8f9fa;
            border-color: #495057;
          }
          .admin-search-input::placeholder {
            color: #adb5bd;
            opacity: 1;
          }
        `}
      </style>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Trainer Bookings</h4>
          <div className="admin-muted">Create trainer sessions, track status and payments.</div>
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-primary" onClick={openCreateModal} disabled={loading}>
            <i className="bi bi-plus-circle me-2"></i> Create Booking
          </button>

          <button className="btn btn-outline-light" onClick={loadBookings} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div style={{ minWidth: 180 }}>
          <label className="form-label mb-1">Paid Filter</label>
          <select
            className="form-select admin-select-dark"
            value={filterPaid}
            onChange={(e) => setFilterPaid(e.target.value)}
          >
            <option value="all" className="fw-bold">All</option>
            <option value="paid" className="fw-bold">Paid</option>
            <option value="unpaid" className="fw-bold">Unpaid</option>
          </select>
        </div>

        <div style={{ minWidth: 220 }}>
          <label className="form-label mb-1">Status Filter</label>
          <select
            className="form-select admin-select-dark"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all" className="fw-bold">All</option>
            <option value="pending" className="fw-bold">Pending</option>
            <option value="active" className="fw-bold">Active</option>
            <option value="on-hold" className="fw-bold">On Hold</option>
            <option value="completed" className="fw-bold">Completed</option>
          </select>
        </div>

        <div style={{ minWidth: 260 }}>
          <label className="form-label mb-1">Search</label>
          <input
            className="form-control admin-search-input"
            placeholder="Search by user/trainer name or phone"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <button
          className="btn btn-outline-primary"
          onClick={() => {
            setFilterPaid("all");
            setFilterStatus("all");
            setSearchTerm("");
          }}
        >
          Clear Filters
        </button>

        <div className="ms-auto text-muted">
          Showing <b>{filteredBookings.length}</b> booking(s)
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-dark table-hover align-middle mb-0">
          <thead>
            <tr>
              <th style={{ width: 70 }}>ID</th>
              <th>User</th>
              <th>User Phone</th>
              <th>Trainer</th>
              <th>Trainer Phone</th>
              <th>Paid Time</th>
              <th style={{ width: 100 }}>Sessions</th>
              <th style={{ width: 100 }}>Months</th>
              <th style={{ width: 120 }}>Total</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 100 }}>Paid</th>
              <th style={{ width: 200 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredBookings.length === 0 ? (
              <tr>
                <td colSpan="12" className="text-center text-muted py-4">
                  {loading ? "Loading..." : "No bookings found."}
                </td>
              </tr>
            ) : (
              filteredBookings.map((b) => {
                const isPaid = String(b.paid_status || "").toLowerCase() === "paid";
                const { total, remaining } = getSessionProgress(b);
                const monthCount = getMonthCount(b);
                const isCompleted = (total !== null && remaining === 0) || isCompletedStatus(b?.status);
                const statusValue = normalizeBookingStatus(b?.status);
                const isPending = statusValue === "pending";
                const isActive = statusValue === "active";
                const isOnHold = statusValue === "on-hold";
                const sessionDisplay =
                  monthCount !== null ? "-" : total === null ? "-" : `${remaining ?? "-"} / ${total}`;

                return (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td>{b.member_name || "-"}</td>
                    <td>{b.member_phone || "-"}</td>
                    <td>{b.trainer_name || "-"}</td>
                    <td>{b.trainer_phone || "-"}</td>

                    <td>{b.paid_at ? formatDateTimeVideoStyle(b.paid_at) : "-"}</td>

                    <td>{sessionDisplay}</td>
                    <td>{monthCount === null ? "-" : monthCount}</td>
                    <td>{moneyMMK(b.total_price)}</td>
                    <td>{statusBadge(b.status)}</td>
                    <td>{paidBadge(b.paid_status)}</td>

                    <td>
                      {isActive ? (
                        <button
                          className="btn btn-sm btn-outline-warning me-2"
                          disabled={isCompleted || busyKey === `hold-${b.id}`}
                          onClick={() => markHold(b.id)}
                          title={isCompleted ? "All sessions completed" : "Move to on-hold"}
                        >
                          {busyKey === `hold-${b.id}` ? "..." : "Hold"}
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm btn-outline-info me-2"
                          disabled={isCompleted || (!isPending && !isOnHold) || busyKey === `active-${b.id}`}
                          onClick={() => markActive(b.id)}
                          title={
                            isCompleted
                              ? "All sessions completed"
                              : isPending || isOnHold
                                ? "Mark booking as active"
                                : "Only pending/on-hold bookings can be activated"
                          }
                        >
                          {busyKey === `active-${b.id}` ? "..." : "Active"}
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-success"
                        disabled={isPaid || busyKey === `paid-${b.id}`}
                        onClick={() => markPaid(b.id)}
                        title={isPaid ? "Already paid" : "Mark as paid"}
                      >
                        {busyKey === `paid-${b.id}` ? "..." : "Paid"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Create Booking Modal ===== */}
      {showModal && (
        <div
          className="modal fade show"
          style={{ display: "block", background: "rgba(0,0,0,0.6)" }}
          tabIndex="-1"
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
            <div className="modal-content bg-dark text-light admin-modal">
              <div className="modal-header border-secondary">
                <h5 className="modal-title">Create Trainer Booking</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowModal(false)}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label fw-bold">Member</label>
                    <select
                      className="form-select admin-select-dark"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      disabled={optionsLoading}
                    >
                      <option value="" className="fw-bold">Select member</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.phone ? `- ${m.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label fw-bold">Trainer</label>
                    <select
                      className="form-select admin-select-dark"
                      value={trainerId}
                      onChange={(e) => setTrainerId(e.target.value)}
                      disabled={optionsLoading}
                    >
                       <option value="" className="fw-bold">Select trainer</option>
                      {trainers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.phone ? `- ${t.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                    <div className="col-12">
                    <label className="form-label fw-bold">Package Type</label>
                    <div className="row g-2">
                      <div className="col-12 col-md-4">
                        <label className="form-label admin-muted">Personal</label>
                        <select
                          className="form-select admin-select-dark"
                          value={packageGroup === "personal" ? packageType : ""}
                          onChange={handlePackageSelect("personal")}
                          disabled={optionsLoading || packagesLoading}
                        >
                           <option value="" className="fw-bold">
                            Select personal package
                          </option>
                    {trainerPackages.length > 0
                            ? renderPackageOptions(packagesByType.personal, "personal")
                            : packageTypeOptions
                              .filter((type) => normalizePackageType(type) === "personal")
                              .map((type) => (
                                <option key={type} value={type}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </option>
                              ))}
                        </select>
                      </div>

                      <div className="col-12 col-md-4">
                        <label className="form-label admin-muted">Monthly</label>
                        <select
                          className="form-select admin-select-dark"
                          value={packageGroup === "monthly" ? packageType : ""}
                          onChange={handlePackageSelect("monthly")}
                          disabled={optionsLoading || packagesLoading}
                        >
                          <option value="" className="fw-bold">
                            Select monthly package
                          </option>
                          {trainerPackages.length > 0
                            ? renderPackageOptions(packagesByType.monthly, "monthly")
                            : packageTypeOptions
                              .filter((type) => normalizePackageType(type) === "monthly")
                              .map((type) => (
                                <option key={type} value={type}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </option>
                              ))}
                        </select>
                      </div>

                      <div className="col-12 col-md-4">
                        <label className="form-label admin-muted">Duo</label>
                        <select
                          className="form-select admin-select-dark"
                          value={packageGroup === "duo" ? packageType : ""}
                          onChange={handlePackageSelect("duo")}
                          disabled={optionsLoading || packagesLoading}
                        >
                          <option value="" className="fw-bold">
                            Select duo package
                          </option>
                          {trainerPackages.length > 0
                            ? renderPackageOptions(packagesByType.duo, "duo")
                            : packageTypeOptions
                              .filter((type) => normalizePackageType(type) === "duo")
                              .map((type) => (
                                <option key={type} value={type}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </option>
                              ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                  <label className="form-label fw-bold">{countLabel}</label>
                    <input
                      className="form-control"
                      value={sessionsCount}
                      onChange={(e) => setSessionsCount(e.target.value)}
                      disabled={optionsLoading}
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label fw-bold">Price per Session (MMK)</label>
                    <input
                      className="form-control"
                      value={pricePerSession}
                      onChange={(e) => {
                        setPricePerSession(e.target.value);
                        setPriceSource("manual");
                      }}
                      disabled={optionsLoading}
                    />
                     <div className="admin-muted mt-1">
                      {priceSource === "package" && packageType && findSelectedPackage()
                        ? `Package price: ${moneyMMK(
                          findSelectedPackage()?.price_per_session ??
                          findSelectedPackage()?.price ??
                          findSelectedPackage()?.amount
                        )}`
                        : `Default: ${moneyMMK(defaultPrice)}`}
                    </div>
                  </div>

                  <div className="col-12 col-md-3">
                    <label className="form-label fw-bold">Status</label>
                    <select
                      className="form-select admin-select-dark"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      disabled={optionsLoading}
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12 col-md-3">
                    <label className="form-label fw-bold">Paid Status</label>
                    <select
                      className="form-select admin-select-dark"
                      value={paidStatus}
                      onChange={(e) => setPaidStatus(e.target.value)}
                      disabled={optionsLoading}
                    >
                      {paidOptions.map((p) => (
                        <option key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12">
                    <label className="form-label fw-bold">Notes</label>
                    <textarea
                      className="form-control admin-search"
                      rows="3"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={optionsLoading}
                      placeholder="Optional notes..."
                    />
                    <style>
    {`
      .admin-search::placeholder {
        color: #ffffff !important;
        font-weight: 600;
        opacity: 1; /* Firefox fix */
      }
    `}
  </style>
                  </div>

                  <div className="col-12">
                    <div className="d-flex align-items-center justify-content-between p-3 rounded border border-secondary">
                      <div className="admin-muted fw-bold">Total Amount</div>
                      <div className="fs-5 fw-bold">{moneyMMK(total)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer border-secondary">
                <button className="btn btn-outline-light" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={createBooking}
                  disabled={optionsLoading || busyKey === "create"}
                >
                  {busyKey === "create" ? "Saving..." : "Save Booking"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
