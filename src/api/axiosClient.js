import axios from "axios";

// ✅ Always point to API base (include /api)
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://8.222.195.9:6060";

const DEFAULT_CACHE_TTL_MS = 30000;
const requestCache = new Map();


const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  withCredentials: false, // ✅ Bearer token auth (no cookies)
});

function getToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

export function clearRequestCache() {
  requestCache.clear();
}

function clearAuth() {
  // ✅ clear the same key you actually use
  localStorage.removeItem("token");
  sessionStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.removeItem("user");
  clearRequestCache();
}

axiosClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const method = config.method?.toLowerCase();
  const cacheEnabled = method === "get" && config.cache;
  if (cacheEnabled) {
    const ttlMs =
      typeof config.cache === "object" && Number.isFinite(config.cache.ttlMs)
        ? config.cache.ttlMs
        : DEFAULT_CACHE_TTL_MS;

    if (ttlMs > 0) {
      const baseURL = config.baseURL || "";
      const url = config.url || "";
      const paramsKey = config.params ? JSON.stringify(config.params) : "";
      const cacheKey = `${baseURL}${url}?${paramsKey}`;
      const cached = requestCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        config.adapter = () =>
          Promise.resolve({
            data: cached.data,
            status: 200,
            statusText: "OK",
            headers: cached.headers || {},
            config,
            request: null,
          });
      } else {
        config.__cacheKey = cacheKey;
        config.__cacheTtlMs = ttlMs;
      }
    }
  }


  return config;
});

axiosClient.interceptors.response.use(
  (res) => {
    const config = res.config || {};
    if (config.method?.toLowerCase() === "get" && config.__cacheKey) {
      requestCache.set(config.__cacheKey, {
        data: res.data,
        headers: res.headers,
        expiresAt: Date.now() + (config.__cacheTtlMs || DEFAULT_CACHE_TTL_MS),
      });
    }
    return res;
  },

  (err) => {
    if (err?.response?.status === 401) {
      clearAuth();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default axiosClient;