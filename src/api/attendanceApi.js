import axiosClient from "./axiosClient";

export const ATTENDANCE_SCAN_CONTROL_STORAGE_KEY = "attendance_scan_control_v1";

const SCAN_CONTROL_READ_ENDPOINTS = [
  "/attendance/scanner-control",
  "/attendance/scanner/status",
  "/attendance/scan-control",
];

const SCAN_CONTROL_WRITE_ENDPOINTS = [
  { method: "post", url: "/attendance/scanner-control" },
  { method: "post", url: "/attendance/scanner/status" },
  { method: "post", url: "/attendance/scan-control" },
  { method: "patch", url: "/attendance/scanner-control" },
  { method: "patch", url: "/attendance/scanner/status" },
  { method: "patch", url: "/attendance/scan-control" },
];

const toBool = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "on", "active", "enabled", "start", "started"].includes(v))
      return true;
    if (["0", "false", "off", "inactive", "disabled", "stop", "stopped"].includes(v))
      return false;
  }
  return fallback;
};

const extractScanControlFlag = (payload) => {
  const candidate =
    payload?.scanner_active ??
    payload?.scan_active ??
    payload?.is_active ??
    payload?.active ??
    payload?.enabled ??
    payload?.status ??
    payload?.scanner?.active ??
    payload?.data?.scanner_active ??
    payload?.data?.scan_active ??
    payload?.data?.is_active ??
    payload?.data?.active ??
    payload?.data?.enabled ??
    payload?.data?.status;

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

  // All API endpoints failed - default to ON for offline support
  // This ensures scanning works even when backend endpoints are not implemented
  return { isActive: true, source: "default" };
};

export const setAttendanceScanControlStatus = async (isActive) => {
  const desired = !!isActive;

  const body = {
    scanner_active: desired,
    scan_active: desired,
    is_active: desired,
    active: desired,
    enabled: desired,
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

  // if API endpoints fail, at least persist locally
  saveAttendanceScanControlLocal(desired);
  return { isActive: desired, source: "local" };
};

export const scanRfidAttendance = (cardId, options = {}) =>
  axiosClient.post("/attendance/rfid/scan", {
    card_id: String(cardId),
    action: options?.action,
    scan_type: options?.action,
    attendance_event: options?.action,
  });

export const scanMemberCardAttendance = async (memberCardId, options = {}) => {
  const normalizedCardId = String(memberCardId).trim();

  const payloads = [
    {
      member_card_id: normalizedCardId,
      action: options?.action,
      scan_type: options?.action,
      attendance_event: options?.action,
    },
    {
      card_id: normalizedCardId,
      action: options?.action,
      scan_type: options?.action,
      attendance_event: options?.action,
    },
  ];

  const endpoints = ["/attendance/scan", "/attendance/rfid/scan"];

  let lastError;

  for (const url of endpoints) {
    for (const data of payloads) {
      try {
        return await axiosClient.post(url, data);
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError;
};

export const registerRfidCard = (userId, cardId) =>
  axiosClient.post("/attendance/rfid/register", {
    user_id: Number(userId),
    card_id: String(cardId),
  });
