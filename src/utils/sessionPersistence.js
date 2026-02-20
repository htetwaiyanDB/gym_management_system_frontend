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
  // Prioritize localStorage as it persists better across app restarts in mobile environments
  const local = safeStorageGet(localStorage, TOKEN_KEY);
  if (local) return local;

  // Fall back to cookie storage
  const cookie = readCookie(TOKEN_KEY);
  if (cookie) return cookie;

  // Finally fall back to sessionStorage
  return safeStorageGet(sessionStorage, TOKEN_KEY);
}

export function getStoredUser() {
  // Prioritize localStorage as it persists better across app restarts in mobile environments
  const local = safeStorageGet(localStorage, USER_KEY);
  if (local) {
    try {
      return JSON.parse(local);
    } catch {
      // If parsing fails, continue to other storage methods
    }
  }

  // Fall back to cookie storage
  const cookie = readCookie(USER_KEY);
  if (cookie) {
    try {
      return JSON.parse(cookie);
    } catch {
      // If parsing fails, continue to other storage methods
    }
  }

  // Finally fall back to sessionStorage
  const session = safeStorageGet(sessionStorage, USER_KEY);
  if (session) {
    try {
      return JSON.parse(session);
    } catch {
      return null;
    }
  }

  return null;
}

export function persistSession(token, user) {
  const safeToken = String(token || "").trim();
  const userPayload = JSON.stringify(user || null);

  if (safeToken) {
    // Primary storage in localStorage for better persistence in mobile environments
    safeStorageSet(localStorage, TOKEN_KEY, safeToken);
    
    // Also store in sessionStorage and cookies as fallbacks
    safeStorageSet(sessionStorage, TOKEN_KEY, safeToken);
    writeCookie(TOKEN_KEY, safeToken);
  }

  // Primary storage in localStorage for better persistence in mobile environments
  safeStorageSet(localStorage, USER_KEY, userPayload);
  
  // Also store in sessionStorage and cookies as fallbacks
  safeStorageSet(sessionStorage, USER_KEY, userPayload);
  writeCookie(USER_KEY, userPayload);
}

export function clearPersistedSession() {
  // Clear all storage methods to ensure complete logout
  safeStorageRemove(localStorage, TOKEN_KEY);
  safeStorageRemove(sessionStorage, TOKEN_KEY);
  safeStorageRemove(localStorage, USER_KEY);
  safeStorageRemove(sessionStorage, USER_KEY);
  removeCookie(TOKEN_KEY);
  removeCookie(USER_KEY);
}
