function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  if (!text) return null;

  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatDateDDMMYYYY(value, fallback = "—") {
  const date = parseDateLike(value);
  if (!date) return value ? String(value) : fallback;
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateTimeDDMMYYYY(value, fallback = "—") {
  const date = parseDateLike(value);
  if (!date) return value ? String(value) : fallback;

  let hours = date.getHours();
  const minutes = pad2(date.getMinutes());
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${formatDateDDMMYYYY(date, fallback)} ${hours}:${minutes} ${ampm}`;
}
