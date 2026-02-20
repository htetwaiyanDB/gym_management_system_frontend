const TOKEN_KEY = "token";
const USER_KEY = "user";
const TOKEN_COOKIE_KEY = "auth_token";
const USER_COOKIE_KEY = "auth_user";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function readStorage(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function writeStorage(key, value) {
  localStorage.setItem(key, value);
  sessionStorage.setItem(key, value);
}

function removeStorage(key) {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}

function getCookieValue(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookieValue(name, value, maxAge = COOKIE_MAX_AGE_SECONDS) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

function removeCookie(name) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

function decodeUser(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persistAuthSession(token, user) {
  if (!token || !user) return;

  const serializedUser = JSON.stringify(user);
  writeStorage(TOKEN_KEY, String(token));
  writeStorage(USER_KEY, serializedUser);

  setCookieValue(TOKEN_COOKIE_KEY, String(token));
  setCookieValue(USER_COOKIE_KEY, serializedUser);
}

export function readPersistedAuthSession() {
  const storageToken = readStorage(TOKEN_KEY);
  const storageUserRaw = readStorage(USER_KEY);

  const cookieToken = getCookieValue(TOKEN_COOKIE_KEY);
  const cookieUserRaw = getCookieValue(USER_COOKIE_KEY);

  const token = storageToken || cookieToken || null;
  const userRaw = storageUserRaw || cookieUserRaw || null;

  return {
    token,
    user: decodeUser(userRaw),
    source: storageToken || storageUserRaw ? "storage" : cookieToken || cookieUserRaw ? "cookie" : "none",
  };
}

export function hydrateAuthSession() {
  const session = readPersistedAuthSession();
  if (!session.token || !session.user) return session;

  if (!readStorage(TOKEN_KEY) || !readStorage(USER_KEY)) {
    writeStorage(TOKEN_KEY, session.token);
    writeStorage(USER_KEY, JSON.stringify(session.user));
  }

  return session;
}

export function updatePersistedUser(nextUser) {
  if (!nextUser) return;
  const session = readPersistedAuthSession();
  const merged = { ...(session.user || {}), ...nextUser };
  persistAuthSession(session.token, merged);
}

export function clearAuthSession() {
  removeStorage(TOKEN_KEY);
  removeStorage(USER_KEY);
  removeCookie(TOKEN_COOKIE_KEY);
  removeCookie(USER_COOKIE_KEY);
}

export function getPersistedToken() {
  return hydrateAuthSession().token;
}

export function getPersistedUser() {
  return hydrateAuthSession().user;
}
