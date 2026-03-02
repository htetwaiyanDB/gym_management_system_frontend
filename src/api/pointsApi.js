import axiosClient from "./axiosClient";

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const getUserId = (record) =>
  record?.user_id ?? record?.user?.id ?? record?.member_id ?? record?.member?.id ?? null;

export const normalizePointRecord = (record = {}) => ({
  id: record?.id ?? null,
  user_id: getUserId(record),
  points: toNumber(record?.points ?? record?.total_points ?? record?.balance ?? 0, 0),
  updated_at: record?.updated_at ?? record?.created_at ?? null,
});

const normalizePointListPayload = (payload) => {
  const raw =
    payload?.data?.data ??
    payload?.data?.points ??
    payload?.data ??
    payload?.points ??
    (Array.isArray(payload) ? payload : null);

  const list = Array.isArray(raw) ? raw : [];
  return list.map(normalizePointRecord).filter((item) => item.user_id);
};

export const getPoints = async () => {
  const res = await axiosClient.get("/points");
  return normalizePointListPayload(res?.data);
};

export const createPoints = (payload) => axiosClient.post("/points", payload);

export const updatePoints = (id, payload) => axiosClient.put(`/points/${id}`, payload);

export const upsertUserPoints = async ({ userId, points, note }) => {
  const all = await getPoints();
  const existing = all.find((item) => String(item.user_id) === String(userId));

  const payload = {
    user_id: Number(userId),
    points: toNumber(points, 0),
    note: note || undefined,
  };

  if (existing?.id) {
    const res = await updatePoints(existing.id, payload);
    return normalizePointRecord(res?.data?.data ?? res?.data ?? { ...existing, ...payload });
  }

  const createRes = await createPoints(payload);
  return normalizePointRecord(createRes?.data?.data ?? createRes?.data ?? payload);
};

export const awardScanPoints = async ({ userId, action, points = 50 }) => {
  if (!userId) return null;
  const payload = {
    user_id: Number(userId),
    points: toNumber(points, 50),
    source: "attendance_scan",
    action,
    note: `Auto points for ${action || "attendance"}`,
  };

  try {
    const res = await createPoints(payload);
    return normalizePointRecord(res?.data?.data ?? res?.data ?? payload);
  } catch {
    return null;
  }
};
