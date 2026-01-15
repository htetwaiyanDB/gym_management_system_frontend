import axios from "axios";

// ✅ Always point to API base (include /api)
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://8.222.195.9:6060/api";

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

function clearAuth() {
  // ✅ clear the same key you actually use
  localStorage.removeItem("token");
  sessionStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.removeItem("user");
}

axiosClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axiosClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      clearAuth();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default axiosClient;
