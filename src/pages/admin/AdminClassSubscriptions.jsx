import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../api/axiosClient";

function moneyMMK(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("en-US") + " MMK";
}

function normalizeList(payload) {
  if (Array.isArray(payload?.class_subscriptions)) return payload.class_subscriptions;
  if (Array.isArray(payload?.subscriptions)) return payload.subscriptions;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

function isClassPlanName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .includes("class");
}

function isClassPlan(plan) {
  if (!plan) return false;
  const type = String(plan?.type || plan?.plan_type || plan?.category || "")
    .trim()
    .toLowerCase();
  if (type === "class") return true;
  return isClassPlanName(
    plan?.name ||
      plan?.plan_name ||
      plan?.title ||
      plan?.membership_plan_name ||
      plan?.class_plan_name,
  );
}

function planIdOf(plan) {
  return plan?.id ?? plan?.plan_id ?? plan?.membership_plan_id ?? plan?.class_plan_id ?? plan?.class_package_id;
}

function planNameOf(plan) {
  return plan?.name ?? plan?.plan_name ?? plan?.title ?? plan?.membership_plan_name ?? plan?.class_plan_name;
}

function isClassSubscription(record) {
  return isClassPlanName(
    record?.membership_plan_name ||
      record?.plan_name ||
      record?.class_plan_name ||
      record?.class_package_name,
  );
}

function normalizeOptions(payload) {
  const members = Array.isArray(payload?.members) ? payload.members : [];
  const plans =
    (Array.isArray(payload?.class_plans) && payload.class_plans) ||
    (Array.isArray(payload?.membership_plans) && payload.membership_plans) ||
    (Array.isArray(payload?.plans) && payload.plans) ||
    (Array.isArray(payload?.class_packages) && payload.class_packages) ||
    (Array.isArray(payload?.packages) && payload.packages) ||
    [];
  return { members, plans };
}

function pickDurationDays(source) {
  const raw =
    source?.duration_days ??
    source?.membership_plan_duration_days ??
    source?.plan_duration_days ??
    source?.durationDays ??
    source?.duration ??
    source?.days ??
    source?.membership_plan?.duration_days ??
    source?.membershipPlan?.duration_days ??
    source?.plan?.duration_days;

  const num = Number(raw);
  if (raw === null || raw === undefined || raw === "") return null;
  if (Number.isNaN(num)) return null;
  return num;
}

function formatDurationDays(source) {
  const days = pickDurationDays(source);
  if (days === null) return "-";
  return `${days} day(s)`;
}

function parsePriceNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;

  const cleaned = String(value).replace(/[^\d.-]/g, "");
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatClassTime(value) {
  if (!value) return "-";
  const text = String(value).trim();
  const hhmmss = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!hhmmss) return text;
  const hour = Number(hhmmss[1]);
  const minute = hhmmss[2];
  if (Number.isNaN(hour)) return text;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function toApiClassTime(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const hhmm = text.match(/^(\d{1,2}):(\d{2})/);
  if (!hhmm) return text;
  const hour = String(Number(hhmm[1])).padStart(2, "0");
  const minute = hhmm[2];
  return `${hour}:${minute}`;
}


function memberIdOf(member) {
  return member?.id ?? member?.user_id ?? member?.member_id ?? null;
}


function promptExtendPayload() {
  const nextEndDateInput = window.prompt(
    "Enter new end date (YYYY-MM-DD).\nLeave blank to extend by days instead.",
    "",
  );
  if (nextEndDateInput === null) return null;

  const nextEndDate = nextEndDateInput.trim();
  if (nextEndDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextEndDate)) {
      return { error: "Invalid date format. Please use YYYY-MM-DD." };
    }
    return { payload: { new_end_date: nextEndDate } };
  }

  const extensionDaysInput = window.prompt("Enter extension days (example: 7)", "");
  if (extensionDaysInput === null) return null;
  const extensionDays = Number(extensionDaysInput.trim());

  if (!Number.isInteger(extensionDays) || extensionDays <= 0) {
    return { error: "Extension days must be a positive whole number." };
  }

  return { payload: { extension_days: extensionDays } };
}

function formatUserCode(value) {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim();
  if (!text) return "";
  return text.padStart(5, "0");
}

function memberSearchText(member) {
  const id = memberIdOf(member);
  const pieces = [
    member?.name,
    member?.phone,
    member?.email,
    member?.user_id,
    member?.member_id,
    id,
    formatUserCode(id),
  ];
  return pieces
    .filter((piece) => piece !== null && piece !== undefined)
    .map((piece) => String(piece).toLowerCase())
    .join(" ");
}

function memberDisplayLabel(member) {
  const phone = String(member?.phone || "").trim();
  return `${member?.name || "Unknown"} (${phone || "-"})`;
}

function subscriptionSearchText(record) {
  const memberId =
    record?.member_id ?? record?.user_id ?? record?.member?.id ?? record?.user?.id ?? record?.id ?? "";
  const pieces = [
    record?.member_name,
    record?.user_name,
    record?.member_phone,
    record?.user_phone,
    memberId,
    formatUserCode(memberId),
  ];

  return pieces
    .filter((piece) => piece !== null && piece !== undefined)
    .map((piece) => String(piece).toLowerCase())
    .join(" ");
}

async function requestWithFallback(requests) {
  let latestError = null;
  for (const run of requests) {
    try {
      return await run();
    } catch (error) {
      latestError = error;
      if (error?.response?.status !== 404) throw error;
    }
  }
  throw latestError || new Error("Request failed.");
}

export default function AdminClassSubscriptions() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [records, setRecords] = useState([]);
  const [tableSearch, setTableSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [plans, setPlans] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [classSaving, setClassSaving] = useState(false);
  const [classBusyId, setClassBusyId] = useState(null);
  const [classRows, setClassRows] = useState([]);
  const [editingClassId, setEditingClassId] = useState(null);
  const [classNameInput, setClassNameInput] = useState("");
  const [classDayInput, setClassDayInput] = useState("Monday");
  const [classTimeInput, setClassTimeInput] = useState("08:00");
  const [memberId, setMemberId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState("");

  const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  const resetForm = () => {
    setMemberId("");
    setMemberSearch("");
    setPlanId("");
    setStartDate("");
    setDiscountPercentage("");
  };

  const parseDateOnly = (value) => {
    if (!value) return null;
    const s = String(value).trim();
    if (!s) return null;
    const dateOnly = s.includes("T") ? s.split("T")[0] : s.split(" ")[0];
    const parts = dateOnly.split("-").map((part) => Number(part));
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    if (!year || !month || !day) return null;
    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  };

  const isExpiredByDate = (endDateValue) => {
    const endDate = parseDateOnly(endDateValue);
    if (!endDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today > endDate;
  };

  const loadRecords = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await axiosClient.get("/subscriptions");
      const classRecords = normalizeList(res.data).filter(isClassSubscription);
      setRecords(classRecords);
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to load class memberships." });
    } finally {
      setLoading(false);
    }
  };

  const loadOptions = async () => {
    const optionsRes = await requestWithFallback([
      () => axiosClient.get("/subscriptions/options"),
      () => axiosClient.get("/class-subscriptions/options"),
    ]);

    const { members: memberList, plans: planList } = normalizeOptions(optionsRes.data);

    const filteredClassPlans = planList.filter(isClassPlan);
    const candidatePlans = filteredClassPlans.length ? filteredClassPlans : planList;

    const normalizedPlans = candidatePlans
      .map((plan) => ({
        ...plan,
        id: planIdOf(plan),
        name: planNameOf(plan),
        duration_days: pickDurationDays(plan),
      }))
      .filter((plan) => plan.id !== null && plan.id !== undefined);


    setMembers(memberList);
    setPlans(normalizedPlans);

    if (normalizedPlans.length === 1) {
      setPlanId(String(normalizedPlans[0].id || ""));
    }
  };

  const openCreate = async () => {
    resetForm();
    setShowModal(true);
    try {
      await loadOptions();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to load create options." });
    }
  };

  const normalizeClassTimetable = (payload) => {
    const list = Array.isArray(payload?.classes)
      ? payload.classes
      : Array.isArray(payload?.class_timetables)
        ? payload.class_timetables
        : Array.isArray(payload?.timetables)
          ? payload.timetables
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload)
              ? payload
              : [];

    return list
      .map((item) => ({
        id: item?.id ?? item?.class_id ?? item?.timetable_id,
        name: item?.class_name ?? item?.name ?? item?.title,
        day: item?.day ?? item?.weekday ?? item?.class_day,
        time: item?.class_time ?? item?.time,
      }))
      .filter((item) => item.id !== undefined && item.id !== null);
  };

  const loadClassTimetable = async () => {
    try {
      const res = await requestWithFallback([
        () => axiosClient.get("/classes"),
      ]);
      setClassRows(normalizeClassTimetable(res?.data));
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to load class timetable." });
    }
  };

  const resetClassForm = () => {
    setEditingClassId(null);
    setClassNameInput("");
    setClassDayInput("Monday");
    setClassTimeInput("08:00");
  };

  const openCreateClass = () => {
    resetClassForm();
    setShowClassModal(true);
  };

  const openEditClass = (row) => {
    setEditingClassId(row.id);
    setClassNameInput(row.name || "");
    setClassDayInput(weekDays.includes(row.day) ? row.day : "Monday");
    setClassTimeInput(String(row.time || "08:00:00").slice(0, 5));
    setShowClassModal(true);
  };

  const closeClassModal = () => {
    setShowClassModal(false);
    resetClassForm();
  };

  const saveClass = async () => {
    if (!classNameInput.trim()) {
      setMsg({ type: "danger", text: "Please enter class name." });
      return;
    }

    setClassSaving(true);
    setMsg(null);
    const payload = {
      class_name: classNameInput.trim(),
      class_day: classDayInput,
      class_time: toApiClassTime(classTimeInput),
    };

    try {
      if (editingClassId) {
        await requestWithFallback([
          () => axiosClient.put(`/classes/${editingClassId}`, payload),
        ]);
        setMsg({ type: "success", text: "Class updated successfully." });
      } else {
        await requestWithFallback([
          () => axiosClient.post("/classes", payload),
        ]);
        setMsg({ type: "success", text: "Class created successfully." });
      }
      closeClassModal();
      await loadClassTimetable();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to save class." });
    } finally {
      setClassSaving(false);
    }
  };

  const deleteClass = async (id) => {
    setClassBusyId(id);
    setMsg(null);
    try {
      await requestWithFallback([
        () => axiosClient.delete(`/classes/${id}`),
      ]);
      setMsg({ type: "success", text: "Class deleted successfully." });
      await loadClassTimetable();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to delete class." });
    } finally {
      setClassBusyId(null);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const selectedPlan = useMemo(() => plans.find((p) => String(planIdOf(p)) === String(planId)) || null, [plans, planId]);

  const normalizedDiscountPercentage = useMemo(() => {
    if (discountPercentage === "" || discountPercentage === null || discountPercentage === undefined) {
      return 0;
    }
    const value = Number(discountPercentage);
    if (Number.isNaN(value)) return 0;
    return Math.min(100, Math.max(0, value));
  }, [discountPercentage]);

  const selectedPlanPrice = useMemo(() => {
    if (!selectedPlan) return 0;
    return (
      parsePriceNumber(selectedPlan?.price) ??
      parsePriceNumber(selectedPlan?.membership_plan_price) ??
      parsePriceNumber(selectedPlan?.plan_price) ??
      0
    );
  }, [selectedPlan]);

  const calculatedFinalPrice = useMemo(() => {
    const discountAmount = selectedPlanPrice * (normalizedDiscountPercentage / 100);
    return Math.max(0, Math.round(selectedPlanPrice - discountAmount));
  }, [selectedPlanPrice, normalizedDiscountPercentage]);

  const filteredMembers = useMemo(() => {
    const keyword = memberSearch.trim().toLowerCase();
    if (!keyword) return members;
    return members.filter((member) => memberSearchText(member).includes(keyword));
  }, [members, memberSearch]);

  const selectedMember = useMemo(() => {
    if (!memberId) return null;
    return members.find((member) => String(memberIdOf(member)) === String(memberId)) || null;
  }, [members, memberId]);

  const showNoMembersWarning = Boolean(memberSearch.trim()) && filteredMembers.length === 0 && !selectedMember;

  const visibleMemberSuggestions = useMemo(() => filteredMembers.slice(0, 8), [filteredMembers]);

  const selectMember = (member) => {
    const id = memberIdOf(member);
    if (id === null || id === undefined || id === "") return;
    setMemberId(String(id));
    setMemberSearch(memberDisplayLabel(member));
  };

  const onMemberSearchChange = (value) => {
    setMemberSearch(value);

    if (!value.trim()) {
      setMemberId("");
      return;
    }

    const normalized = value.trim().toLowerCase();
    const exactMatch = members.find((member) => memberDisplayLabel(member).toLowerCase() === normalized);
    if (exactMatch) {
      const id = memberIdOf(exactMatch);
      setMemberId(id === null || id === undefined ? "" : String(id));
      return;
    }

    if (selectedMember && !memberSearchText(selectedMember).includes(normalized)) {
      setMemberId("");
    }
  };

  const save = async () => {
    if (!memberId) return setMsg({ type: "danger", text: "Please select a member." });
    if (!planId) return setMsg({ type: "danger", text: "Please select a class package." });

    const parsedPlanId = Number(planId);
    if (Number.isNaN(parsedPlanId)) {
      return setMsg({ type: "danger", text: "Class plan is missing from options. Please create a Class plan first." });
    }

    const hasDiscount = discountPercentage !== "" && discountPercentage !== null && discountPercentage !== undefined;
    const normalizedDiscount = hasDiscount ? Number(discountPercentage) : null;
    if (hasDiscount && (Number.isNaN(normalizedDiscount) || normalizedDiscount < 0 || normalizedDiscount > 100)) {
      setMsg({ type: "danger", text: "Discount percentage must be between 0 and 100." });
      return;
    }

    setSaving(true);
    setMsg(null);

    const payload = {
      member_id: Number(memberId),
      membership_plan_id: parsedPlanId,
      class_plan_id: parsedPlanId,
      class_package_id: parsedPlanId,
      plan_id: parsedPlanId,
      discount_percentage: normalizedDiscount,
      final_price: calculatedFinalPrice,
    };

    if (startDate) payload.start_date = startDate;
    const resolvedPlanPrice =
      parsePriceNumber(selectedPlan?.price) ??
      parsePriceNumber(selectedPlan?.membership_plan_price) ??
      parsePriceNumber(selectedPlan?.plan_price);

    if (resolvedPlanPrice !== null) {
      payload.price = resolvedPlanPrice;
    }

    try {
      await axiosClient.post("/subscriptions", payload);
      setMsg({ type: "success", text: "Class membership created successfully." });
      closeModal();
      await loadRecords();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to save class membership." });
    } finally {
      setSaving(false);
    }
  };

  const setRecordOnHold = async (id) => {
    setMsg(null);
    setBusyId(id);
    try {
      const res = await axiosClient.post(`/subscriptions/${id}/hold`);
      setMsg({ type: "success", text: res?.data?.message || "Class membership placed on hold." });
      await loadRecords();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to change class membership status." });
    } finally {
      setBusyId(null);
    }
  };

  const resumeRecord = async (id) => {
    setMsg(null);
    setBusyId(id);
    try {
      const res = await axiosClient.post(`/subscriptions/${id}/resume`);
      setMsg({ type: "success", text: res?.data?.message || "Class membership resumed." });
      await loadRecords();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to resume class membership." });
    } finally {
      setBusyId(null);
    }
  };

  const extendRecord = async (id) => {
    const extendConfig = promptExtendPayload();
    if (!extendConfig) return;
    if (extendConfig.error) {
      setMsg({ type: "danger", text: extendConfig.error });
      return;
    }

    setMsg(null);
    setBusyId(id);
    try {
      const res = await axiosClient.patch(`/subscriptions/${id}/extend`, extendConfig.payload);
      setMsg({ type: "success", text: res?.data?.message || "Class membership end date extended." });
      await loadRecords();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to extend class membership." });
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    loadRecords();
    loadClassTimetable();
  }, []);

  const sortedRecords = useMemo(() => {
    const list = [...records];
    list.sort((a, b) => {
      const statusA = String(a?.status || "").toLowerCase();
      const statusB = String(b?.status || "").toLowerCase();
      const expiredA = statusA === "expired" || isExpiredByDate(a?.end_date);
      const expiredB = statusB === "expired" || isExpiredByDate(b?.end_date);
      const activeA = statusA === "active" && !expiredA;
      const activeB = statusB === "active" && !expiredB;
      const rankA = activeA ? 0 : expiredA ? 2 : 1;
      const rankB = activeB ? 0 : expiredB ? 2 : 1;
      if (rankA !== rankB) return rankA - rankB;
      return (b?.id ?? 0) - (a?.id ?? 0);
    });
    return list;
  }, [records]);

  const filteredRecords = useMemo(() => {
    const keyword = tableSearch.trim().toLowerCase();
    if (!keyword) return sortedRecords;
    return sortedRecords.filter((record) => subscriptionSearchText(record).includes(keyword));
  }, [sortedRecords, tableSearch]);

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Class Membership Management</h4>
          <div className="admin-muted">Track members enrolled in the class plan and manage hold/resume status.</div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-info" onClick={() => nav("/admin/subscriptions")}>
            <i className="bi bi-credit-card-2-front me-2"></i> Membership Page
          </button>
          <button className="btn btn-sm btn-primary" onClick={openCreate}>
            <i className="bi bi-plus-circle me-2"></i> Add New Membership
          </button>
          <button className="btn btn-sm btn-outline-light" onClick={loadRecords} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="admin-card p-3 mb-4 border border-secondary-subtle">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h5 className="mb-0">Class Timetable</h5>
          <button className="btn btn-sm btn-primary" onClick={openCreateClass}>
            <i className="bi bi-plus-circle me-2"></i>Create Class
          </button>
        </div>
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Class Name</th>
                <th>Days</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {classRows.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center text-muted py-4">No classes found.</td>
                </tr>
              ) : (
                classRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name || "-"}</td>
                    <td>{row.day || "-"}</td>
                    <td>{formatClassTime(row.time)}</td>
                    <td>
                      <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-warning" onClick={() => openEditClass(row)}>Edit</button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => deleteClass(row.id)}
                          disabled={classBusyId === row.id}
                        >
                          {classBusyId === row.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-3">
        <input
          type="text"
          className="form-control bg-dark text-white border-secondary"
          placeholder="Search by member name / ID / phone"
          style={{ maxWidth: "420px" }}
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
        />
      </div>

      <div className="table-responsive">
        <table className="table table-dark table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>ID</th>
              <th>Member</th>
              <th>Member Phone</th>
              <th>Plan</th>
              <th>Price</th>
              <th>Discount</th>
              <th>Final Price</th>
              <th>Duration</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="12" className="text-center text-muted py-4">{loading ? "Loading..." : tableSearch.trim() ? "No class memberships matched your search." : "No class memberships found."}</td>
              </tr>
            ) : (
              filteredRecords.map((r, index) => {
                const rawStatus = String(r?.status || "");
                const isOnHold = !!r?.is_on_hold;
                const isExpired = rawStatus.toLowerCase() === "expired" || isExpiredByDate(r?.end_date);
                const status = isExpired ? "Expired" : rawStatus || "-";
                const canHold = !isExpired && !isOnHold && rawStatus.toLowerCase() === "active";
                const canResume = !isExpired && isOnHold;
                const canExtend = isExpired;

                return (
                <tr key={r.id}>
                  <td>{index + 1}</td>
                  <td>{r.member_name || r.user_name || "-"}</td>
                  <td>{r.member_phone || r.user_phone || "-"}</td>
                  <td><span className="badge bg-primary">{r.class_plan_name || r.class_package_name || r.membership_plan_name || r.plan_name || "-"}</span></td>
                  <td>{moneyMMK(r.price)}</td>
                  <td>{r.discount_percentage !== null && r.discount_percentage !== undefined && r.discount_percentage !== "" ? `${r.discount_percentage}%` : "-"}</td>
                  <td>{moneyMMK(r.final_price)}</td>
                  <td>{formatDurationDays(r)}</td>
                  <td>{r.start_date ? String(r.start_date).split("T")[0] : "-"}</td>
                  <td>{r.end_date ? String(r.end_date).split("T")[0] : "-"}</td>
                  <td>
                    {status.toLowerCase() === "active" && (
                      <span className="badge bg-success">Active</span>
                    )}
                    {status.toLowerCase() === "on hold" && (
                      <span className="badge bg-warning text-dark">On Hold</span>
                    )}
                    {status.toLowerCase() === "expired" && (
                      <span className="badge bg-danger text-white">Expired</span>
                    )}
                    {!['active', 'on hold', 'expired'].includes(status.toLowerCase()) && (
                      <span className="badge bg-info text-dark">{status || '-'}</span>
                    )}
                  </td>
                  <td>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm btn-warning"
                        disabled={!canHold || busyId === r.id}
                        onClick={() => setRecordOnHold(r.id)}
                        title="Place class membership on hold"
                      >
                        {busyId === r.id ? "..." : "Hold"}
                      </button>
                      <button
                        className="btn btn-sm btn-success"
                        disabled={!canResume || busyId === r.id}
                        onClick={() => resumeRecord(r.id)}
                        title="Resume class membership"
                      >
                        {busyId === r.id ? "..." : "Resume"}
                      </button>
                      <button
                        className="btn btn-sm btn-info"
                        disabled={!canExtend || busyId === r.id}
                        onClick={() => extendRecord(r.id)}
                        title="Extend expired class membership end date"
                      >
                        {busyId === r.id ? "..." : "Extend"}
                      </button>
                    </div>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content bg-dark text-white">
                <div className="modal-header">
                  <h5 className="modal-title fw-bolder">Create Class Membership</h5>
                  <button className="btn-close btn-close-white" onClick={closeModal} aria-label="Close"></button>
                </div>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label fw-bold">Member</label>
                      <input
                        type="text"
                        className="form-control bg-dark text-white mb-2"
                        placeholder="Search member by name / phone / email"
                        value={memberSearch}
                        onChange={(e) => onMemberSearchChange(e.target.value)}
                      />
                      {!!memberSearch.trim() && visibleMemberSuggestions.length > 0 && (
                        <div className="list-group mb-2" style={{ maxHeight: 220, overflowY: "auto" }}>
                          {visibleMemberSuggestions.map((m) => {
                            const id = memberIdOf(m);
                            const isSelected = String(id) === String(memberId);
                            return (
                              <button
                                key={id}
                                type="button"
                                className={`list-group-item list-group-item-action ${isSelected ? "active" : "bg-dark text-white border-secondary"}`}
                                onClick={() => selectMember(m)}
                              >
                                {memberDisplayLabel(m)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {showNoMembersWarning && (
                        <div className="form-text text-warning">No members matched your search.</div>
                      )}
                      {selectedMember && (
                        <div className="form-text text-success">Selected: {memberDisplayLabel(selectedMember)}</div>
                      )}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-bold">Plan</label>
                      <select className="form-select bg-dark text-white" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                        <option value="">Select plan</option>
                        {plans.map((p) => {
                          const id = planIdOf(p);
                          return (
                            <option key={String(id)} value={String(id || "")}>{planNameOf(p) || "Class"}</option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-bold">Start Date</label>
                      <input type="date" className="form-control bg-dark text-white" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-bold">Discount Percentage (%)</label>
                      <input
                        type="number"
                        className="form-control bg-dark text-white"
                        min="0"
                        max="100"
                        step="0.01"
                        value={discountPercentage}
                        onChange={(e) => setDiscountPercentage(e.target.value)}
                        placeholder="Optional"
                      />
                      <div className="form-text text-white-50">Enter a value between 0 and 100.</div>
                    </div>
                  </div>

                  {selectedPlan && (
                    <div className="mt-3 p-3 rounded bg-dark border border-secondary-subtle">
                      <div className="fw-bold">{selectedPlan.name || selectedPlan.plan_name || "Class"}</div>
                      <div className="text-white-50">Duration: {formatDurationDays(selectedPlan)}</div>
                      <div className="text-white-50">Price: {moneyMMK(selectedPlanPrice)}</div>
                      <div className="alert alert-success mt-2 mb-0 py-2 px-3">
                        <span className="fw-semibold">Final Price: {moneyMMK(calculatedFinalPrice)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-light" onClick={closeModal}>Cancel</button>
                  <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Create"}</button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {showClassModal && (
        <>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content bg-dark text-white">
                <div className="modal-header">
                  <h5 className="modal-title fw-bolder">{editingClassId ? "Edit Class" : "Create Class"}</h5>
                  <button className="btn-close btn-close-white" onClick={closeClassModal} aria-label="Close"></button>
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label fw-bold">Class Name</label>
                    <input
                      type="text"
                      className="form-control bg-dark text-white"
                      placeholder="Enter class name"
                      value={classNameInput}
                      onChange={(e) => setClassNameInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label fw-bold">Day</label>
                    <select
                      className="form-select bg-dark text-white"
                      value={classDayInput}
                      onChange={(e) => setClassDayInput(e.target.value)}
                    >
                      {weekDays.map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3">
                    <label className="form-label fw-bold">Time</label>
                    <input
                      type="time"
                      className="form-control bg-dark text-white"
                      value={classTimeInput}
                      onChange={(e) => setClassTimeInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-light" onClick={closeClassModal}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveClass} disabled={classSaving}>
                    {classSaving ? "Saving..." : editingClassId ? "Update" : "Create"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  );
}
