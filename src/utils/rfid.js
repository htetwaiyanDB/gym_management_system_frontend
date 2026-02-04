export function normalizeCardId(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function isCardNotRegisteredError(message) {
  if (!message) return false;
  return String(message).toLowerCase().includes("card not registered");
}
