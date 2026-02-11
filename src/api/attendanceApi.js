import axiosClient from "./axiosClient";

export const ATTENDANCE_SCAN_CONTROL_STORAGE_KEY = "attendance_scan_control_v1";

const SCAN_CONTROL_READ_ENDPOINTS = [
  "/attendance/scanner-control",
  "/attendance/scanner/status",
  "/attendance/scan-control",
  "/attendance/scanner",
  "/attendance/scan-status",
  "/attendance/scanner-state",
];

const SCAN_CONTROL_WRITE_ENDPOINTS = [
  { method: "post", url: "/attendance/scanner-control" },
  { method: "post", url: "/attendance/scanner/status" },
  { method: "post", url: "/attendance/scan-control" },
  { method: "post", url: "/attendance/scanner" },
  { method: "post", url: "/attendance/scan-status" },
  { method: "post", url: "/attendance/scanner-state" },
  { method: "patch", url: "/attendance/scanner-control" },
  { method: "patch", url: "/attendance/scanner/status" },
  { method: "patch", url: "/attendance/scan-control" },
  { method: "patch", url: "/attendance/scanner" },
  { method: "patch", url: "/attendance/scan-status" },
  { method: "patch", url: "/attendance/scanner-state" },
];

const toBool = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "on", "active", "enabled", "start", "started"].includes(v)) return true;
    if (["0", "false", "off", "inactive", "disabled", "stop", "stopped"].includes(v)) return false;
  }
  return fallback;
};

const extractScanControlFlag = (payload) => {
  const candidate =
    payload?.scanner_active ??
    payload?.scanner_status ??
    payload?.scanner_state ??
    payload?.is_scanner_active ??
    payload?.scan_enabled ??
    payload?.scan_active ??
    payload?.is_active ??
    payload?.active ??
    payload?.enabled ??
    payload?.status ??
    payload?.scannerControl?.active ??
    payload?.scannerControl?.enabled ??
    payload?.scannerControl?.status ??
    payload?.scanner_control?.active ??
    payload?.scanner_control?.enabled ??
    payload?.scanner_control?.status ??
    payload?.scanner?.active ??
    payload?.scanner?.enabled ??
    payload?.scanner?.status ??
    payload?.data?.scanner_active ??
    payload?.data?.scanner_status ??
    payload?.data?.scanner_state ??
    payload?.data?.is_scanner_active ??
    payload?.data?.scan_enabled ??
    payload?.data?.scan_active ??
    payload?.data?.is_active ??
    payload?.data?.active ??
    payload?.data?.enabled ??
    payload?.data?.status ??
    payload?.data?.scannerControl?.active ??
    payload?.data?.scannerControl?.enabled ??
    payload?.data?.scannerControl?.status ??
    payload?.data?.scanner_control?.active ??
    payload?.data?.scanner_control?.enabled ??
    payload?.data?.scanner_control?.status ??
    payload?.data?.scanner?.active ??
    payload?.data?.scanner?.enabled ??
    payload?.data?.scanner?.status;

  return toBool(candidate, false);
};

export const saveAttendanceScanControlLocal = (isActive) => {
  const payload = {
    isActive: !!isActive,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(ATTENDANCE_SCAN_CONTROL_STORAGE_KEY, JSON.stringify(payload));
  return payload;
};

export const readAttendanceScanControlLocal = () => {
  try {
    const raw = localStorage.getItem(ATTENDANCE_SCAN_CONTROL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      isActive: toBool(parsed?.isActive, false),
      updatedAt: parsed?.updatedAt || null,
    };
  } catch {
    return null;
  }
};

export const getAttendanceScanControlStatus = async () => {
  for (const url of SCAN_CONTROL_READ_ENDPOINTS) {
    try {
      const res = await axiosClient.get(url);
      const isActive = extractScanControlFlag(res?.data || {});
      saveAttendanceScanControlLocal(isActive);
      return { isActive, source: "api" };
    } catch {
      // try next endpoint
    }
  }

  const cached = readAttendanceScanControlLocal();
  if (cached) {
    return { isActive: cached.isActive, source: "local" };
  }

  return { isActive: false, source: "default" };
};

export const setAttendanceScanControlStatus = async (isActive) => {
  const desired = !!isActive;
  const body = {
    scanner_active: desired,
    scanner_status: desired ? "on" : "off",
    scanner_state: desired ? "active" : "inactive",
    is_scanner_active: desired,
    scan_enabled: desired,
    scan_active: desired,
    is_active: desired,
    active: desired,
    enabled: desired,
    action: desired ? "start" : "stop",
    command: desired ? "start" : "stop",
    state: desired ? "on" : "off",
    status: desired ? "active" : "inactive",
  };

  for (const endpoint of SCAN_CONTROL_WRITE_ENDPOINTS) {
    try {
      const res = await axiosClient.request({
        method: endpoint.method,
        url: endpoint.url,
        data: body,
      });
      const next = extractScanControlFlag(res?.data || body);
      saveAttendanceScanControlLocal(next);
      return { isActive: next, source: "api" };
    } catch {
      // try next endpoint
    }
  }

  saveAttendanceScanControlLocal(desired);
  throw new Error("Unable to sync scanner status with server.");
};

export const scanRfidAttendance = (cardId) =>
  axiosClient.post("/attendance/rfid/scan", { card_id: String(cardId) });

export const scanMemberCardAttendance = (memberCardId) =>
  axiosClient.post("/attendance/scan", { member_card_id: String(memberCardId) });

export const registerRfidCard = (userId, cardId) =>
  axiosClient.post("/attendance/rfid/register", {
    user_id: Number(userId),
    card_id: String(cardId),
  });
