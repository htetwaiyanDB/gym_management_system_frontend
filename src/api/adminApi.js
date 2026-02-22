import axiosClient from "./axiosClient";

function normalizeCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.classes)) return payload.classes;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function toClassFormData(input = {}) {
  const form = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    form.append(key, value);
  });
  return form;
}

export async function getClasses() {
  const res = await axiosClient.get("/classes");
  return normalizeCollection(res?.data);
}

export async function createClass(payload) {
  const form = toClassFormData(payload);
  const res = await axiosClient.post("/classes", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res?.data;
}

export async function updateClass(classId, payload) {
  const form = toClassFormData(payload);
  form.append("_method", "PUT");
  const res = await axiosClient.post(`/classes/${classId}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res?.data;
}

export async function deleteClass(classId) {
  const res = await axiosClient.delete(`/classes/${classId}`);
  return res?.data;
}
