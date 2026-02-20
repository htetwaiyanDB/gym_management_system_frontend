const TOKEN_KEY = "token";
const USER_KEY = "user";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hasDocument() {
  return typeof document !== "undefined";
}

function writeCookie(name, value, maxAgeSeconds = COOKIE_MAX_AGE_SECONDS) {
  if (!hasDocument()) return;
  const encoded = encodeURIComponent(value ?? "");
  document.cookie = `${name}=${encoded}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

function readCookie(name) {
  if (!hasDocument()) return null;
  const target = `${name}=`;
  const chunks = document.cookie ? document.cookie.split(";") : [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

function removeCookie(name) {
  if (!hasDocument()) return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

function safeStorageGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // ignore quota/security errors from webviews
  }
}

function safeStorageRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getStoredToken() {
  const local = safeStorageGet(localStorage, TOKEN_KEY);
  if (local) return local;

  const session = safeStorageGet(sessionStorage, TOKEN_KEY);
  if (session) return session;

  return readCookie(TOKEN_KEY);
}

export function getStoredUser() {
  const raw =
    safeStorageGet(localStorage, USER_KEY) ||
    safeStorageGet(sessionStorage, USER_KEY) ||
    readCookie(USER_KEY);

  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persistSession(token, user) {
  const safeToken = String(token || "").trim();
  const userPayload = JSON.stringify(user || null);

  if (safeToken) {
    safeStorageSet(localStorage, TOKEN_KEY, safeToken);
    safeStorageSet(sessionStorage, TOKEN_KEY, safeToken);
    writeCookie(TOKEN_KEY, safeToken);
  }

  safeStorageSet(localStorage, USER_KEY, userPayload);
  safeStorageSet(sessionStorage, USER_KEY, userPayload);
  writeCookie(USER_KEY, userPayload);
}

export function clearPersistedSession() {
  safeStorageRemove(localStorage, TOKEN_KEY);
  safeStorageRemove(sessionStorage, TOKEN_KEY);
  safeStorageRemove(localStorage, USER_KEY);
  safeStorageRemove(sessionStorage, USER_KEY);
  removeCookie(TOKEN_KEY);
  removeCookie(USER_KEY);
}
