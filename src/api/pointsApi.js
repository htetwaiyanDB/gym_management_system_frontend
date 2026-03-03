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
  points: toNumber(record?.points ?? record?.point ?? record?.total_points ?? record?.balance ?? 0, 0),
  user_name: record?.user_name ?? record?.user?.name ?? null,
  user_role: (record?.user_role ?? record?.user?.role ?? "").toString().toLowerCase() || null,
  updated_at: record?.updated_at ?? record?.created_at ?? null,
});

const normalizePointListPayload = (payload) => {
  const raw =
    payload?.data?.data ??
    payload?.data?.points ??
    payload?.data?.point ??
    payload?.data ??
    payload?.points ??
    payload?.point ??
    (Array.isArray(payload) ? payload : null);

  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  return list.map(normalizePointRecord).filter((item) => item.user_id);
};

export const getPoints = async () => {
  const res = await axiosClient.get("/points");
  return normalizePointListPayload(res?.data);
};

export const createPoints = (payload) => axiosClient.post("/points", payload);

export const updatePointsByUserId = (userId, payload) => axiosClient.put(`/points/${userId}`, payload);

export const adjustPoints = (payload) => axiosClient.patch("/points/adjust", payload);

export const upsertUserPoints = async ({ userId, points, note }) => {
  const all = await getPoints();
  const existing = all.find((item) => String(item.user_id) === String(userId));

  const payload = {
    user_id: Number(userId),
    points: toNumber(points, 0),
    note: note || undefined,
  };

  if (existing) {
    const currentPoints = toNumber(existing?.points, 0);
    const adjustment = payload.points - currentPoints;
    const res = await updatePointsByUserId({
      ...payload,
      amount: adjustment,
      adjustment,
    });
    return normalizePointRecord(res?.data?.data ?? res?.data ?? { ...payload, id: existing.id });
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
