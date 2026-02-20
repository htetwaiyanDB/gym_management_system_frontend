const AUTH_COOKIE_TOKEN_KEY = "unity_auth_token";
const AUTH_COOKIE_USER_KEY = "unity_auth_user";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function safeBase64Encode(value) {
  try {
    return btoa(unescape(encodeURIComponent(value)));
  } catch {
    return "";
  }
}

function safeBase64Decode(value) {
  try {
    return decodeURIComponent(escape(atob(value)));
  } catch {
    return "";
  }
}

function getCookieValue(name) {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? match.split("=").slice(1).join("=") : "";
}

function setCookie(name, value) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

function clearCookie(name) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

export function saveAuthSession(token, userObj) {
  if (!token || !userObj) return;

  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(userObj));

  const encodedToken = safeBase64Encode(String(token));
  const encodedUser = safeBase64Encode(JSON.stringify(userObj));
  if (encodedToken) setCookie(AUTH_COOKIE_TOKEN_KEY, encodedToken);
  if (encodedUser) setCookie(AUTH_COOKIE_USER_KEY, encodedUser);
}

export function clearAuthSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");

  clearCookie(AUTH_COOKIE_TOKEN_KEY);
  clearCookie(AUTH_COOKIE_USER_KEY);
}

export function getAuthToken() {
  const localToken = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (localToken) return localToken;

  const cookieToken = getCookieValue(AUTH_COOKIE_TOKEN_KEY);
  const decoded = safeBase64Decode(cookieToken);
  return decoded || null;
}

export function getStoredUser() {
  const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const encoded = getCookieValue(AUTH_COOKIE_USER_KEY);
  const decoded = safeBase64Decode(encoded);
  if (!decoded) return null;

  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function hydrateAuthSessionFromCookie() {
  const token = localStorage.getItem("token") || safeBase64Decode(getCookieValue(AUTH_COOKIE_TOKEN_KEY));
  const rawUser = localStorage.getItem("user") || safeBase64Decode(getCookieValue(AUTH_COOKIE_USER_KEY));

  if (!token || !rawUser) return null;

  try {
    const parsedUser = typeof rawUser === "string" ? JSON.parse(rawUser) : rawUser;
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(parsedUser));
    return { token, user: parsedUser };
  } catch {
    return null;
  }
}
